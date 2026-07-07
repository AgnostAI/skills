#!/usr/bin/env node
// detect.mjs — inspect a project directory and decide which Agnost integration
// to apply. Prints a JSON descriptor the runner uses to pick the instrumentation
// path.
//
// Usage: node detect.mjs [--dir <path>] [--strategy auto|sdk|otel] [--json]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  const value = process.argv[i + 1];
  return i !== -1 && value && !value.startsWith("--") ? value : def;
}
const dir = arg("dir", process.cwd());
const strategy = arg("strategy", process.env.AGNOST_STRATEGY || "auto");
const jsonOut = process.argv.includes("--json");
if (!["auto", "sdk", "otel"].includes(strategy)) fail("--strategy must be auto, sdk, or otel");

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function has(deps, ...names) {
  return names.some((n) => deps[n] !== undefined || Object.keys(deps).some((k) => k === n || k.startsWith(n + "/")));
}

// Each framework maps to one instrumentation path.
function classify() {
  const pkg = readJson(`${dir}/package.json`);

  // ── Node / TypeScript ──
  if (pkg) {
    const candidates = workspaceCandidates(dir);
    if (isWorkspaceRoot(pkg, dir) && candidates.length > 0) {
      fail(`monorepo root detected; rerun with --dir <target>. candidates: ${candidates.join(", ")}`);
    }
    const deps = dependencyMap(pkg);
    if (strategy !== "otel") {
      if (has(deps, "@modelcontextprotocol/sdk") && !hasNodeAppSignals(deps)) {
        return rec("mcp-ts", "node", "ingest", "Dedicated MCP server (TypeScript) via the `agnost` SDK");
      }
      return rec("conversation-ts", "node", "ingest", "Generic Node/TS app via the `agnostai` Conversation SDK");
    }
    if (has(deps, "@mastra/core", "@mastra/core/agent", "mastra")) {
      return rec("mastra", "node", "otel", "Mastra agent framework (OTLP traces → Agnost collector)");
    }
    if (has(deps, "spectrum-ts", "@spectrum-ts/core")) {
      return rec("spectrum-ts", "node", "otel", "Spectrum TS app-level OTel spans → Agnost collector");
    }
    if (has(deps, "langchain", "@langchain")) {
      return rec("langchain-ts", "node", "otel", "LangChain JS/TS via LangSmith OTel mode → Agnost collector");
    }
    if (has(deps, "ai", "@ai-sdk/openai", "@ai-sdk/anthropic", "@ai-sdk/provider")) {
      return rec("vercel-ai", "node", "otel", "Vercel AI SDK (experimental_telemetry → OTLP → Agnost collector)");
    }
    if (has(deps, "openai", "@openai/agents")) {
      return rec("openai-ts", "node", "otel", "OpenAI SDK via OpenInference OTel → Agnost collector");
    }
    if (strategy === "otel") {
      fail("no supported OTel framework found in package.json; rerun with --strategy sdk to use the Agnost SDK path");
    }
  }

  const py = pythonProject(dir);
  if (py) {
    if (strategy !== "otel") {
      if (hasPy(py, "fastmcp", "mcp")) {
        return rec("mcp-py", "python", "ingest", "Python MCP server via the `agnost-mcp` SDK");
      }
      return rec("conversation-py", "python", "ingest", "Generic Python app via the `agnost` Conversation SDK");
    }
    if (hasPy(py, "langchain", "langgraph")) {
      return rec("langchain-py", "python", "otel", "LangChain Python via LangSmith OTel mode → Agnost collector");
    }
    if (hasPy(py, "openai", "openai-agents")) {
      return rec("openai-py", "python", "otel", "OpenAI Python SDK via OpenInference OTel → Agnost collector");
    }
    if (strategy === "otel") {
      fail("no supported Python OTel framework found; rerun with --strategy sdk to use the Agnost SDK path");
    }
  }

  fail("no supported Node/TypeScript or Python project found");
}

function rec(framework, language, transport, reason) {
  return {
    framework,
    language,
    strategy,
    transport, // "ingest" (X-Org-Id HTTP) or "otel" (X-Agnost-Org-ID OTLP)
    reason,
    envVar: transport === "otel" ? "AGNOST_OTEL_URL" : "AGNOST_ENDPOINT",
    orgHeader: transport === "otel" ? "X-Agnost-Org-ID" : "X-Org-Id",
  };
}

function isWorkspaceRoot(pkg, root) {
  return Boolean(
    pkg.workspaces ||
    existsSync(join(root, "pnpm-workspace.yaml")) ||
    existsSync(join(root, "lerna.json")) ||
    existsSync(join(root, "nx.json")) ||
    existsSync(join(root, "turbo.json")) ||
    existsSync(join(root, "rush.json"))
  );
}

function workspaceCandidates(root) {
  const out = [];
  for (const base of ["apps", "packages", "services"]) {
    const basePath = join(root, base);
    if (!existsSync(basePath)) continue;
    for (const entry of readdirSync(basePath, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(basePath, entry.name, "package.json"))) {
        out.push(`${base}/${entry.name}`);
      }
    }
  }
  return out;
}

function dependencyMap(pkg) {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
}

function hasNodeAppSignals(deps) {
  return has(
    deps,
    "openai",
    "@openai/agents",
    "@anthropic-ai/sdk",
    "anthropic",
    "ai",
    "@ai-sdk/openai",
    "@ai-sdk/anthropic",
    "@ai-sdk/provider",
    "langchain",
    "@langchain",
    "@mastra/core",
    "@mastra/core/agent",
    "mastra",
    "spectrum-ts",
    "@spectrum-ts/core",
    "next",
    "react",
    "express",
    "fastify",
    "hono",
    "@nestjs/core"
  );
}

function pythonProject(root) {
  const files = ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"];
  let text = "";
  let found = false;
  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    found = true;
    text += `\n${readFileSync(path, "utf8")}`;
  }
  return found ? text.toLowerCase() : null;
}

function hasPy(text, ...names) {
  return names.some((name) => new RegExp(`(^|[^a-z0-9_.-])${escapeRe(name.toLowerCase())}([^a-z0-9_.-]|$)`).test(text));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const result = classify();
if (jsonOut) console.log(JSON.stringify(result));
else {
  console.log(`framework:  ${result.framework}`);
  console.log(`language:   ${result.language}`);
  console.log(`strategy:   ${result.strategy}`);
  console.log(`transport:  ${result.transport} (${result.orgHeader})`);
  console.log(`reason:     ${result.reason}`);
}

function fail(message) {
  if (jsonOut) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(`error: ${message}`);
  process.exit(1);
}
