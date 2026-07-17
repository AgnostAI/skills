#!/usr/bin/env node
// instrument.mjs - apply the safe, automated Agnost edit for detected projects.
//
// Public automation slice:
//   - mcp-ts: add agnost dependency/env and patch the MCP server file with trackMCP.
//   - conversation-ts: add dependency/env only; generic turn-handler rewrites need
//     known app shapes before they are safe.
//   - conversation-py: add agnost dependency/env only.
//   - vercel-ai: enable telemetry on known modern AI SDK calls.
//   - openai-ts/openai-py: add OpenInference OTLP dependency/env setup.
//   - spectrum-ts: add OTLP dependency/env setup; message-loop span wiring remains recipe-driven.
//   - mastra: add OTLP dependency/env setup and configure known Mastra startup objects.
//   - langchain-ts/langchain-py: add OTLP dependency/env setup; source wiring remains recipe-driven.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { endpointsFor, readConfig, resolveOrgId } from "./lib/agnost.mjs";

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  const value = process.argv[i + 1];
  return i !== -1 && value && !value.startsWith("--") ? value : def;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

const dir = arg("dir", process.cwd());
const framework = arg("framework", null);
const mode = arg("mode", readConfig(dir)?.mode || "local");
const orgId = resolveOrgId({ orgId: arg("org-id", null), dir });
const envMode = arg("env-mode", process.env.AGNOST_ENV_MODE || "file");
const jsonOut = flag("json");

if (!orgId) fail("no org id. Run provision.mjs first or pass --org-id.");
if (!framework) fail("no framework. Run detect.mjs first and pass --framework <name>.");
if (!["local", "prod"].includes(mode)) fail("--mode must be local or prod");
if (!["file", "shell", "manual"].includes(envMode)) fail("--env-mode must be file, shell, or manual");

const result = {
  ok: true,
  framework,
  orgId,
  dir,
  appTelemetryReady: false,
  reference: referenceFor(framework),
  filesChanged: [],
  warnings: [],
};

if (framework === "mcp-ts") {
  readPackageJson();
  patchMcpTypeScript();
  result.appTelemetryReady = true;
  addPackageDependencies({ agnost: process.env.AGNOST_MCP_PACKAGE || "^0.1.11" });
  configureEnv({
    AGNOST_ORG_ID: orgId,
    AGNOST_ENDPOINT: endpointsFor(mode).ingest,
  });
} else if (framework === "conversation-ts") {
  addPackageDependencies({ agnostai: process.env.AGNOST_CONVERSATION_PACKAGE || "^0.1.2" });
  configureEnv({
    AGNOST_ORG_ID: orgId,
    AGNOST_ENDPOINT: endpointsFor(mode).ingest,
  });
  result.warnings.push("conversation-ts dependency/env added; automatic turn-handler rewrite is not enabled without a recognized app shape");
} else if (framework === "conversation-py") {
  addPythonRequirements(["agnost"]);
  configureEnv({
    AGNOST_ORG_ID: orgId,
    AGNOST_ENDPOINT: endpointsFor(mode).ingest,
  });
  result.warnings.push("conversation-py dependency/env added; wrap the real AI turn with agnost.begin(...).end(...) or agnost.track_ai(...)");
} else if (framework === "mcp-py") {
  addPythonRequirements(["agnost-mcp"]);
  configureEnv({
    AGNOST_ORG_ID: orgId,
    AGNOST_ENDPOINT: endpointsFor(mode).ingest,
  });
  result.warnings.push("mcp-py dependency/env added; wire agnost-mcp into the MCP server startup per docs");
} else if (framework === "vercel-ai") {
  if (patchVercelAiTelemetry()) {
    setupOtelTypeScript({
      "@opentelemetry/sdk-node": "^0.52.1",
      "@opentelemetry/exporter-trace-otlp-proto": "^0.52.1",
    });
    result.appTelemetryReady = patchVercelNextStartup();
    result.warnings.push("Vercel AI telemetry enabled; add userId/sessionId metadata inside experimental_telemetry when available");
  } else if (hasLegacyOpenAiStream()) {
    setupOtelTypeScript({
      "@opentelemetry/sdk-node": "^0.52.1",
      "@opentelemetry/exporter-trace-otlp-proto": "^0.52.1",
    });
    patchVercelNextStartup();
    result.warnings.push("legacy Vercel AI OpenAIStream detected; no source rewrite was applied. The setup event will reach Agnost, but app telemetry requires migrating to generateText/streamText/generateObject or manual SDK instrumentation");
  } else {
    setupOtelTypeScript({
      "@opentelemetry/sdk-node": "^0.52.1",
      "@opentelemetry/exporter-trace-otlp-proto": "^0.52.1",
    });
    patchVercelNextStartup();
    result.warnings.push("vercel-ai dependency/env added; no uninstrumented generateText/streamText/generateObject call found");
  }
} else if (framework === "openai-ts") {
  setupOtelTypeScript({
    "@arizeai/openinference-instrumentation-openai": openInferenceOpenAiVersion(),
    "@arizeai/openinference-core": "latest",
    "@opentelemetry/sdk-node": "^0.52.1",
    "@opentelemetry/exporter-trace-otlp-proto": "^0.52.1",
    "@opentelemetry/api": "^1.9.0",
  });
  result.warnings.push("openai-ts dependency/env added; initialize OpenInference before importing openai and pass user/session context per docs");
} else if (framework === "openai-py") {
  setupOtelPython([
    "openinference-instrumentation-openai",
    "opentelemetry-sdk",
    "opentelemetry-exporter-otlp-proto-http",
  ]);
  result.warnings.push("openai-py dependency/env added; initialize OpenAIInstrumentor before creating the OpenAI client and pass user/session context per docs");
} else if (framework === "mastra") {
  setupOtelTypeScript({
    "@mastra/observability": "latest",
    "@mastra/otel-exporter": "latest",
  });
  result.appTelemetryReady = patchMastraObservability();
} else if (framework === "spectrum-ts") {
  setupOtelTypeScript({
    "@opentelemetry/sdk-node": "^0.52.1",
    "@opentelemetry/exporter-trace-otlp-proto": "^0.52.1",
    "@opentelemetry/api": "^1.9.0",
  });
  noteSpectrumTelemetry();
  result.warnings.push("spectrum-ts OTel deps/env added; wrap the Spectrum message loop with the app-level span recipe so Agnost receives AI telemetry");
} else if (framework === "langchain-ts") {
  setupOtelTypeScript({
    langsmith: "latest",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/context-async-hooks": "^1.30.1",
    "@opentelemetry/sdk-trace-base": "^1.30.1",
    "@opentelemetry/exporter-trace-otlp-proto": "^0.57.2",
  });
  configureLangSmithTypeScriptEnv();
  result.warnings.push("langchain-ts dependency/env added; LangSmith OTel startup wiring remains a recipe step");
} else if (framework === "langchain-py") {
  setupOtelPython([
    "langsmith[otel]",
    "opentelemetry-sdk",
    "opentelemetry-exporter-otlp-proto-http",
  ]);
  configureLangSmithPythonEnv();
  result.warnings.push("langchain-py dependency/env added; enable LangSmith OTel mode before importing or constructing LangChain objects");
} else {
  fail(`framework '${framework}' is not in the public automation slice yet`);
}

print(result);

function addPackageDependencies(deps) {
  const { path, pkg } = readPackageJson();
  pkg.dependencies ||= {};
  let didChange = false;
  for (const [name, version] of Object.entries(deps)) {
    if (packageDependencyMap(pkg)[name]) continue;
    pkg.dependencies[name] = version;
    didChange = true;
  }
  if (!didChange) return;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  changed(path);
}

function addPythonRequirements(reqs) {
  const requirementsPath = join(dir, "requirements.txt");
  if (!existsSync(requirementsPath)) {
    const pyprojectPath = join(dir, "pyproject.toml");
    if (existsSync(pyprojectPath) && patchPyprojectDependencies(pyprojectPath, reqs)) return;
  }
  const path = requirementsPath;
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/).filter((line) => line.length > 0) : [];
  const installed = new Set(lines.map(requirementName).filter(Boolean));
  let didChange = false;
  for (const req of reqs) {
    const name = requirementName(req);
    if (name && installed.has(name)) continue;
    const extras = requirementExtras(req);
    if (extras.length > 0) {
      const base = requirementBaseName(req);
      const index = lines.findIndex((line) => requirementBaseName(line) === base);
      if (index !== -1) {
        const nextLine = mergeRequirementExtrasLine(lines[index], extras);
        if (nextLine !== lines[index]) {
          lines[index] = nextLine;
          didChange = true;
        }
        continue;
      }
    }
    lines.push(req);
    didChange = true;
  }
  if (!didChange) return;
  writeFileSync(path, lines.join("\n") + "\n");
  changed(path);
  if (!existing) {
    result.warnings.push("requirements.txt created for Agnost dependencies; merge these packages into your lockfile if you use Poetry, uv, or another package manager");
  }
}

function patchPyprojectDependencies(path, reqs) {
  let text = readFileSync(path, "utf8");
  let missing = reqs.filter((req) => !hasRequirement(text, req));
  if (missing.length === 0) return true;
  if (/^\[tool\.poetry\.dependencies\]\s*$/m.test(text)) {
    const next = patchPoetryDependencies(text, missing);
    if (next !== text) {
      writeFileSync(path, next);
      changed(path);
    }
    return true;
  }
  const projectNext = patchProjectDependencies(text, missing);
  if (projectNext) {
    writeFileSync(path, projectNext);
    changed(path);
    return true;
  }
  return false;
}

function patchProjectDependencies(text, reqs) {
  text = expandInlineProjectDependencies(text);
  let missing = [];
  for (const req of reqs) {
    const extras = requirementExtras(req);
    const base = requirementBaseName(req);
    const lineRe = new RegExp(`^(\\s*["'])${escapeRe(base)}(?:\\[([^\\]]+)\\])?([^"']*["'],?)\\s*$`, "m");
    const line = text.match(lineRe)?.[0] || "";
    if (!line) {
      missing.push(req);
      continue;
    }
    if (extras.length > 0) {
      text = text.replace(lineRe, mergeQuotedRequirementExtrasLine(line, extras));
    }
  }
  if (missing.length === 0) return text;
  const added = missing.map((req) => `  "${req}",`).join("\n");
  if (/^dependencies\s*=\s*\[\s*\]$/m.test(text)) {
    text = text.replace(/^dependencies\s*=\s*\[\s*\]$/m, `dependencies = [\n${added}\n]`);
  } else {
    const match = text.match(/^dependencies\s*=\s*\[\n/m);
    if (match && match.index !== undefined) {
      const insertAt = match.index + match[0].length;
      text = text.slice(0, insertAt) + `${added}\n` + text.slice(insertAt);
    } else {
      const project = text.match(/^\[project\]\s*$/m);
      if (!project || project.index === undefined) return false;
      const insertAt = project.index + project[0].length + 1;
      text = text.slice(0, insertAt) + `dependencies = [\n${added}\n]\n` + text.slice(insertAt);
    }
  }
  return text;
}

function expandInlineProjectDependencies(text) {
  return text.replace(/^dependencies\s*=\s*\[(.+)\]\s*$/m, (line, raw) => {
    const deps = raw.split(/,(?=\s*["'])/).map((dep) => dep.trim()).filter(Boolean);
    if (deps.length === 0) return line;
    return `dependencies = [\n${deps.map((dep) => `  ${dep.replace(/,$/, "")},`).join("\n")}\n]`;
  });
}

function patchPoetryDependencies(text, reqs) {
  const section = text.match(/^\[tool\.poetry\.dependencies\]\s*$/m);
  if (!section || section.index === undefined) return text;
  const start = section.index + section[0].length + 1;
  const endMatch = text.slice(start).match(/^\[/m);
  const end = endMatch && endMatch.index !== undefined ? start + endMatch.index : text.length;
  let body = text.slice(start, end);
  const missing = [];
  for (const req of reqs) {
    const name = poetryName(req);
    const lineRe = new RegExp(`^\\s*${escapeRe(name)}\\s*=.*$`, "m");
    const line = body.match(lineRe)?.[0] || "";
    if (!line) {
      missing.push(req);
      continue;
    }
    if (req.includes("[")) {
      const nextLine = mergePoetryExtrasLine(line, poetryExtras(req));
      body = body.replace(lineRe, nextLine);
    }
  }
  if (missing.length === 0) return text.slice(0, start) + body + text.slice(end);
  const added = missing.map(poetryDependencyLine).join("\n") + "\n";
  return text.slice(0, start) + added + body + text.slice(end);
}

function poetryDependencyLine(req) {
  const name = poetryName(req);
  const extras = req.match(/\[([^\]]+)\]/)?.[1];
  if (!extras) return `${name} = "*"`;
  const extraList = extras.split(",").map((extra) => `"${extra.trim()}"`).join(", ");
  return `${name} = { version = "*", extras = [${extraList}] }`;
}

function poetryExtras(req) {
  return (req.match(/\[([^\]]+)\]/)?.[1] || "")
    .split(",")
    .map((extra) => extra.trim())
    .filter(Boolean);
}

function mergePoetryExtrasLine(line, extras) {
  const extrasField = (values) => `extras = [${values.map((extra) => `"${extra}"`).join(", ")}]`;
  if (/\bextras\s*=/.test(line)) {
    return line.replace(/extras\s*=\s*\[([^\]]*)\]/, (match, raw) => {
      const existing = raw
        .split(",")
        .map((extra) => extra.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      const next = mergeExtras(existing, extras);
      return extrasField(next);
    });
  }
  if (/\}\s*$/.test(line)) return line.replace(/\s*\}\s*$/, `, ${extrasField(extras)} }`);
  return line.replace(/=\s*(["'][^"']*["'])\s*$/, `= { version = $1, ${extrasField(extras)} }`);
}

function poetryName(req) {
  return requirementName(req).replace(/\[[^\]]+\]$/, "");
}

function hasRequirement(text, req) {
  return text.split(/\r?\n/).some((line) => requirementSatisfies(line, req));
}

function requirementSatisfies(line, req) {
  const wanted = requirementName(req);
  const found = requirementName(line);
  if (!wanted || !found) return false;
  if (found === wanted) return true;

  const wantedBase = requirementBaseName(req);
  if (requirementBaseName(line) !== wantedBase) return false;

  const wantedExtras = requirementExtras(req);
  if (wantedExtras.length === 0) return true;
  const foundExtras = requirementExtras(line);
  return wantedExtras.every((extra) => foundExtras.includes(extra));
}

function requirementName(line) {
  const trimmed = line.trim().replace(/^["']/, "").replace(/["'],?$/, "").replace(/,$/, "");
  if (!trimmed || trimmed.startsWith("#")) return "";
  return trimmed.split(/[<>=~!;]/, 1)[0].trim().toLowerCase();
}

function requirementBaseName(line) {
  return requirementName(line).replace(/\[[^\]]+\]$/, "");
}

function requirementExtras(line) {
  return (requirementName(line).match(/\[([^\]]+)\]/)?.[1] || "")
    .split(",")
    .map((extra) => extra.trim())
    .filter(Boolean);
}

function mergeRequirementExtrasLine(line, extras) {
  return line.replace(/^(\s*)([A-Za-z0-9_.-]+)(?:\[([^\]]+)\])?/, (match, indent, name, raw = "") => {
    const next = mergeExtras(raw.split(",").map((extra) => extra.trim()).filter(Boolean), extras);
    return `${indent}${name}[${next.join(",")}]`;
  });
}

function mergeQuotedRequirementExtrasLine(line, extras) {
  return line.replace(/^(\s*["'])([A-Za-z0-9_.-]+)(?:\[([^\]]+)\])?/, (match, prefix, name, raw = "") => {
    const next = mergeExtras(raw.split(",").map((extra) => extra.trim()).filter(Boolean), extras);
    return `${prefix}${name}[${next.join(",")}]`;
  });
}

function mergeExtras(existing, extras) {
  const next = [...existing];
  for (const extra of extras) {
    if (!next.includes(extra)) next.push(extra);
  }
  return next;
}

function writeEnv(values) {
  const path = join(dir, ".env");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set();
  const next = lines.map((line) => {
    const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
    if (!key || !(key in values)) return line;
    seen.add(key);
    return `${key}=${values[key]}`;
  });
  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }
  const text = next.filter((line, i, a) => line !== "" || i < a.length - 1).join("\n") + "\n";
  if (text !== existing) {
    writeFileSync(path, text);
    changed(path);
  }
}

function configureEnv(values) {
  result.env = { ...(result.env || {}), ...values };
  if (envMode === "manual") {
    result.warnings.push(`manual env mode; set ${Object.keys(values).join(", ")} in the app runtime`);
    return;
  }
  if (envMode === "shell") {
    writeShellEnv(values);
    result.warnings.push("shell env mode; source .agnost-env.sh before starting the app");
    return;
  }
  writeEnv(values);
}

function writeShellEnv(values) {
  const path = join(dir, ".agnost-env.sh");
  const text = Object.entries(values)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join("\n") + "\n";
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (text !== existing) {
    writeFileSync(path, text);
    changed(path);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function readPackageJson() {
  const path = join(dir, "package.json");
  const pkg = readJson(path);
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    fail(`package.json not found or invalid at ${path}`);
  }
  return { path, pkg };
}

function packageDependencyVersion(name) {
  const { pkg } = readPackageJson();
  return packageDependencyMap(pkg)[name] || "";
}

function packageDependencyMap(pkg) {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
}

function openInferenceOpenAiVersion() {
  const version = packageDependencyVersion("openai");
  if (/(^|[<>=~^ ])(?:4|5)(?:[.\s<>=~^]|$)/.test(version)) return "~2.3.1";
  if (/(^|[<>=~^ ])6(?:[.\s<>=~^]|$)/.test(version) || version === "latest" || version === "*" || version === "") return "^4.0.0";
  result.warnings.push(`could not infer OpenInference/OpenAI compatibility from openai ${version}; using latest`);
  return "latest";
}

function setupOtelTypeScript(deps) {
  addPackageDependencies(deps);
  configureOtelEnv();
}

function setupOtelPython(reqs) {
  addPythonRequirements(reqs);
  configureOtelEnv();
}

function configureOtelEnv() {
  const tracesEndpoint = `${endpointsFor(mode).otel.replace(/\/$/, "")}/v1/traces`;
  configureEnv({
    AGNOST_ORG_ID: orgId,
    AGNOST_OTEL_URL: endpointsFor(mode).otel,
    OTEL_EXPORTER_OTLP_ENDPOINT: endpointsFor(mode).otel,
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: tracesEndpoint,
    OTEL_EXPORTER_OTLP_HEADERS: `X-Agnost-Org-ID=${orgId}`,
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
  });
}

function configureLangSmithTypeScriptEnv() {
  configureEnv({
    LANGSMITH_TRACING: "true",
    LANGCHAIN_TRACING_V2: "true",
    LANGSMITH_TRACING_MODE: "otel",
  });
}

function configureLangSmithPythonEnv() {
  configureEnv({
    LANGSMITH_OTEL_ENABLED: "true",
    LANGSMITH_TRACING: "true",
    LANGSMITH_OTEL_ONLY: "true",
  });
}

function patchVercelAiTelemetry() {
  return patchKnownCallOption({
    label: "Vercel AI",
    callRe: /\b(?:generateText|streamText|generateObject)\s*\(\s*\{/g,
    optionName: "experimental_telemetry",
    optionText: "experimental_telemetry: { isEnabled: true },",
  });
}

function hasLegacyOpenAiStream() {
  for (const path of sourceFiles(dir)) {
    if (/\bOpenAIStream\s*\(/.test(readFileSync(path, "utf8"))) return true;
  }
  return false;
}

function patchVercelNextStartup() {
  const { pkg } = readPackageJson();
  const deps = packageDependencyMap(pkg);
  if (!deps.next) {
    result.warnings.push("Vercel AI OTel env/deps added; add the startup exporter from references/frameworks.md if this is not a Next.js app");
    return false;
  }

  const existing = [
    "instrumentation.ts",
    "instrumentation.js",
    "src/instrumentation.ts",
    "src/instrumentation.js",
  ].find((file) => existsSync(join(dir, file)));
  if (existing) {
    result.warnings.push(`${existing} already exists; ensure it starts an OTLP exporter to Agnost before AI SDK calls`);
    return false;
  }

  const useSrc = existsSync(join(dir, "src", "app")) || existsSync(join(dir, "src", "pages"));
  const path = join(dir, useSrc ? "src/instrumentation.ts" : "instrumentation.ts");
  writeFileSync(path, `export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-proto");

  new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: \`\${process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai"}/v1/traces\`,
      headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID || "" },
    }),
  }).start();
}
`);
  changed(path);
  result.warnings.push(`Next.js OTLP startup created in ${relative(dir, path)}`);
  return true;
}

function noteSpectrumTelemetry() {
  let hasSpectrumStartup = false;
  let hasNativeTelemetryFlag = false;
  for (const path of sourceFiles(dir)) {
    const text = readFileSync(path, "utf8");
    if (/\bSpectrum\s*\(\s*\{/.test(text)) hasSpectrumStartup = true;
    if (/\bSpectrum\s*\(\s*\{[\s\S]*?\btelemetry\s*:\s*true/.test(text)) hasNativeTelemetryFlag = true;
  }
  if (!hasSpectrumStartup) {
    result.warnings.push("spectrum-ts dependency/env added; no Spectrum({...}) startup call found");
  }
  if (hasNativeTelemetryFlag) {
    result.warnings.push("Spectrum native telemetry is not an Agnost OTLP route in current spectrum-ts; keep the app-level OTel span recipe for Agnost");
  }
}

function patchMastraObservability() {
  const patched = patchKnownCallOption({
    label: "Mastra",
    callRe: /\bnew\s+Mastra\s*\(\s*\{/g,
    optionName: "observability",
    optionText: `observability: new Observability({
  configs: {
    default: {
      serviceName: "agnost-mastra-app",
      exporters: [
        new OtelExporter({
          provider: {
            custom: {
              endpoint: \`\${process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai"}/v1/traces\`,
              headers: { "X-Agnost-Org-ID": String(process.env.AGNOST_ORG_ID || "") },
              protocol: "http/protobuf",
            },
          },
        }),
      ],
    },
  },
}),`,
    importFrom: "@mastra/otel-exporter",
    importName: "OtelExporter",
    requireImportSyntax: true,
  });
  addImportToChangedFiles("@mastra/observability", "Observability");
  if (!patched) {
    result.warnings.push("mastra dependency/env added; no uninstrumented ESM new Mastra({...}) startup object found");
  }
  return patched;
}

function addImportToChangedFiles(importFrom, importName) {
  for (const rel of [...result.filesChanged]) {
    const path = join(dir, rel);
    if (!existsSync(path) || !sourceFiles(dir).includes(path)) continue;
    const text = readFileSync(path, "utf8");
    const next = addNamedImport(text, importFrom, importName);
    if (next !== text) writeFileSync(path, next);
  }
}

function patchKnownCallOption({ label, callRe, optionName, optionText, importFrom = null, importName = null, requireImportSyntax = false }) {
  let patchedAny = false;
  for (const path of sourceFiles(dir)) {
    let text = readFileSync(path, "utf8");
    if (requireImportSyntax && !/^\s*import\s/m.test(text)) continue;
    callRe.lastIndex = 0;
    let match;
    let patchedFile = false;
    while ((match = callRe.exec(text))) {
      const braceIndex = text.indexOf("{", match.index);
      if (braceIndex === -1) continue;
      const end = findMatchingBrace(text, braceIndex);
      if (end === -1) continue;
      const objectText = text.slice(braceIndex, end + 1);
      if (hasTopLevelProperty(objectText, optionName)) {
        callRe.lastIndex = end + 1;
        continue;
      }
      const insert = `\n${indentBlock(optionText, indentForOption(text, braceIndex))}`;
      text = text.slice(0, braceIndex + 1) + insert + text.slice(braceIndex + 1);
      patchedFile = true;
      patchedAny = true;
      callRe.lastIndex = braceIndex + insert.length + 1;
    }
    if (patchedFile) {
      if (importFrom && importName) text = addNamedImport(text, importFrom, importName);
      writeFileSync(path, text);
      changed(path);
      result.warnings.push(`${label} configuration option added in ${relative(dir, path)}; confirm app startup exports OTLP before deploying`);
    }
  }
  return patchedAny;
}

function patchMcpTypeScript() {
  const candidates = sourceFiles(dir).filter((path) => {
    const text = readFileSync(path, "utf8");
    return /@modelcontextprotocol\/sdk\/server\//.test(text) && /\bnew\s+(Server|McpServer)(?:<[^>\n]+>)?\s*\(/.test(text);
  });
  if (candidates.length === 0) fail("could not find a TypeScript MCP server file to patch");

  const patchable = candidates.filter((path) => /^\s*import\s/m.test(readFileSync(path, "utf8")));
  if (patchable.length === 0) {
    fail("detected MCP server files use CommonJS; automatic CommonJS MCP rewrites are not enabled");
  }

  const ranked = patchable
    .map((path) => ({ path, score: mcpEntrypointScore(path) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const target = ranked.find(({ path }) => !hasActiveTrackMcp(readFileSync(path, "utf8")))?.path || ranked[0].path;
  let text = readFileSync(target, "utf8");
  if (hasActiveTrackMcp(text)) {
    result.warnings.push(`${relative(dir, target)} already calls trackMCP`);
    return;
  }

  const match = text.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*new\s+(?:Server|McpServer)(?:<[^>\n]+>)?\s*\(/);
  if (!match || match.index === undefined) fail(`could not find an assigned MCP server in ${relative(dir, target)}`);

  const statementEnd = findStatementEnd(text, match.index);
  if (statementEnd === -1) fail(`could not find the end of the MCP server declaration in ${relative(dir, target)}`);

  const serverVar = match[1];
  const envVar = uniqueName(text, "agnostEnv");
  const snippet = `

const ${envVar} = configureFromEnv();
trackMCP(${serverVar}, ${envVar}.orgId, ${envVar}.config);
`;

  text = text.slice(0, statementEnd + 1) + snippet + text.slice(statementEnd + 1);
  text = addNamedImport(text, "agnost", "trackMCP");
  text = addNamedImport(text, "agnost", "configureFromEnv");
  writeFileSync(target, text);
  changed(target);
  result.warnings.push(
    "For TypeScript MCP OAuth servers, verify the transport preserves requestInfo/authInfo: use transport.handleRequest(req, res, req.body), or pass { requestInfo: { headers: req.headers }, authInfo: req.auth } through custom handleMessage paths. Do not log raw bearer tokens."
  );
}

function addNamedImport(text, moduleName, importedName) {
  const importRe = new RegExp(`^(\\s*)import\\s*\\{([^}]+)\\}\\s*from\\s*["']${escapeRe(moduleName)}["'];?\\s*$`, "m");
  const existing = text.match(importRe);
  if (existing) {
    const names = existing[2].split(",").map((s) => s.trim()).filter(Boolean);
    if (!names.includes(importedName)) names.push(importedName);
    return text.replace(importRe, `${existing[1]}import { ${names.join(", ")} } from "${moduleName}";`);
  }
  const lastImport = [...text.matchAll(/^import [^\n]+;?[ \t]*$/gm)].pop();
  const line = `import { ${importedName} } from "${moduleName}";\n`;
  if (!lastImport || lastImport.index === undefined) {
    if (text.startsWith("#!")) {
      const firstLineEnd = text.indexOf("\n");
      if (firstLineEnd !== -1) return text.slice(0, firstLineEnd + 1) + line + text.slice(firstLineEnd + 1);
    }
    return line + text;
  }
  const insertAt = lastImport.index + lastImport[0].length;
  return text.slice(0, insertAt) + "\n" + line + text.slice(insertAt);
}

function sourceFiles(root) {
  const out = [];
  const skip = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".vercel",
    ".output",
    "out",
    "generated",
    "vendor",
    "test",
    "tests",
    "__tests__",
    "fixtures",
  ]);
  const exts = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
  walk(root);
  return out;

  function walk(path) {
    const st = statSync(path);
    if (st.isDirectory()) {
      if (skip.has(path.split(/[\\/]/).pop())) return;
      for (const entry of readdirSync(path)) walk(join(path, entry));
      return;
    }
    const name = path.split(/[\\/]/).pop() || "";
    if (name.endsWith(".d.ts") || name.endsWith(".min.js")) return;
    if ([...exts].some((ext) => path.endsWith(ext))) out.push(path);
  }
}

function mcpEntrypointScore(path) {
  const text = readFileSync(path, "utf8");
  let score = 0;
  if (/\bserver\.connect\s*\(/.test(text) || /\.connect\s*\(/.test(text)) score += 4;
  if (/\bsetRequestHandler\s*\(|\bregisterTool\s*\(|\.tool\s*\(/.test(text)) score += 3;
  if (/(^|[/\\])(src[/\\])?(index|server|main)\.[cm]?[jt]sx?$/.test(path)) score += 2;
  if (hasActiveTrackMcp(text)) score -= 10;
  return score;
}

function hasActiveTrackMcp(text) {
  return text
    .split(/\r?\n/)
    .some((line) => !/^\s*\/\//.test(line) && /\btrackMCP\s*\(/.test(line));
}

function findStatementEnd(text, start) {
  let quote = null;
  let escape = false;
  let parens = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") parens++;
    else if (ch === ")") parens = Math.max(0, parens - 1);
    else if (ch === ";" && parens === 0) return i;
    else if (ch === "\n" && parens === 0 && i > start) return i - 1;
  }
  return -1;
}

function findMatchingBrace(text, start) {
  let quote = null;
  let escape = false;
  let braces = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") braces++;
    else if (ch === "}") {
      braces--;
      if (braces === 0) return i;
    }
  }
  return -1;
}

function hasTopLevelProperty(objectText, propertyName) {
  let quote = null;
  let escape = false;
  let braces = 0;
  let brackets = 0;
  let parens = 0;
  const propertyRe = new RegExp(`^\\s*${escapeRe(propertyName)}\\s*:`);
  for (let i = 0; i < objectText.length; i++) {
    const ch = objectText[i];
    if (quote) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
    else if (ch === "(") parens++;
    else if (ch === ")") parens--;

    if (braces === 1 && brackets === 0 && parens === 0 && propertyRe.test(objectText.slice(i))) {
      return true;
    }
  }
  return false;
}

function indentForOption(text, index) {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const indent = text.slice(lineStart, index).match(/^\s*/)?.[0] || "";
  return `${indent}  `;
}

function indentBlock(text, indent) {
  return text.split("\n").map((line) => `${indent}${line}`).join("\n");
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function uniqueName(text, base) {
  if (!new RegExp(`\\b${base}\\b`).test(text)) return base;
  let i = 2;
  while (new RegExp(`\\b${base}${i}\\b`).test(text)) i++;
  return `${base}${i}`;
}

function changed(path) {
  const p = relative(dir, path);
  if (!result.filesChanged.includes(p)) result.filesChanged.push(p);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function referenceFor(name) {
  return {
    "conversation-ts": "references/frameworks.md#conversation-ts-agnostai",
    "conversation-py": "references/frameworks.md#conversation-py-agnost",
    "mcp-ts": "references/frameworks.md#mcp-ts-agnost",
    "mcp-py": "references/frameworks.md#mcp-py-agnost-mcp",
    "vercel-ai": "references/frameworks.md#vercel-ai-otlp",
    "openai-ts": "references/frameworks.md#openai-openinference-otlp",
    "openai-py": "references/frameworks.md#openai-openinference-otlp",
    "mastra": "references/frameworks.md#mastra-otlp",
    "spectrum-ts": "references/frameworks.md#spectrum-ts-app-level-otel-spans",
    "langchain-ts": "references/frameworks.md#langchain-langsmith-otel-mode",
    "langchain-py": "references/frameworks.md#langchain-langsmith-otel-mode",
  }[name] || "references/frameworks.md";
}

function fail(message) {
  print({ ok: false, error: message });
  process.exit(1);
}

function print(obj) {
  if (jsonOut) {
    console.log(JSON.stringify(obj));
    return;
  }
  if (!obj.ok) {
    console.error(`error: ${obj.error}`);
    return;
  }
  console.log(`instrumented ${obj.framework}`);
  for (const file of obj.filesChanged) console.log(`  changed: ${file}`);
  for (const warning of obj.warnings) console.log(`  warning: ${warning}`);
}
