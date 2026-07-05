#!/usr/bin/env node
// run.mjs - agent helper for Agnost integration.
// Detects, resolves org id, instruments a supported helper path, and sends a setup event.
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  const value = process.argv[i + 1];
  return i !== -1 && value && !value.startsWith("--") ? value : def;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

const dir = resolve(arg("dir", process.cwd()));
const mode = flag("prod") || process.env.AGNOST_MODE === "prod" ? "prod" : "local";
const orgId = arg("org-id", process.env.AGNOST_ORG_ID || null);
const jsonOut = flag("json");
const envMode = arg("env-mode", process.env.AGNOST_ENV_MODE || "file");
const strategy = arg("strategy", process.env.AGNOST_STRATEGY || "auto");

try {
  const provisionArgs = [mode === "prod" ? "--prod" : "--local", "--dir", dir, "--json"];
  if (orgId) provisionArgs.push("--org-id", orgId);

  const detected = scriptJson("detect.mjs", ["--dir", dir, "--strategy", strategy, "--json"]);
  const identity = scriptJson("provision.mjs", provisionArgs);
  const instrumented = scriptJson("instrument.mjs", [
    "--dir", dir,
    "--framework", detected.framework,
    "--org-id", identity.orgId,
    "--mode", identity.mode || mode,
    "--env-mode", envMode,
    "--json",
  ]);
  const setupEvent = scriptJson("send-demo.mjs", [
    "--org-id", identity.orgId,
    "--transport", detected.transport,
    "--mode", identity.mode || mode,
    "--json",
  ]);

  print({
    ok: Boolean(instrumented.ok && setupEvent.ok),
    orgId: identity.orgId,
    mode: identity.mode,
    framework: detected.framework,
    strategy: detected.strategy || strategy,
    transport: detected.transport,
    envMode,
    env: instrumented.env || null,
    appTelemetryReady: Boolean(instrumented.appTelemetryReady),
    reference: instrumented.reference || null,
    filesChanged: instrumented.filesChanged || [],
    warnings: instrumented.warnings || [],
    setupEvent,
    nextStep: nextStep(detected.transport, instrumented, envMode),
  });
} catch (error) {
  print({ ok: false, error: error.message });
  process.exit(1);
}

function scriptJson(name, args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [join(scriptDir, name), ...args], {
      cwd: dir,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
    }));
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim();
    throw new Error(`${name} failed${output ? `: ${output}` : ""}`);
  }
}

function print(result) {
  if (jsonOut) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.ok) {
    console.error(`error: ${result.error}`);
    return;
  }
  console.log(`Agnost setup event sent for ${result.framework}`);
  console.log(`  org:       ${result.orgId}`);
  console.log(`  mode:      ${result.mode}`);
  console.log(`  strategy:  ${result.strategy}`);
  console.log(`  transport: ${result.transport}`);
  console.log(`  env mode:  ${result.envMode}`);
  console.log(`  app code:  ${result.appTelemetryReady ? "wired" : "recipe needed"}`);
  if (result.env) {
    for (const [key, value] of Object.entries(result.env)) console.log(`  env:       ${key}=${value}`);
  }
  if (result.setupEvent) {
    console.log(`  setup:     sent to ${result.setupEvent.endpoint}`);
    console.log(`  session:   ${result.setupEvent.session}`);
  }
  for (const file of result.filesChanged) console.log(`  changed:   ${file}`);
  for (const warning of result.warnings) console.log(`  warning:   ${warning}`);
  if (result.reference) console.log(`  recipe:    ${result.reference}`);
  if (result.nextStep) console.log(`  next:      ${result.nextStep}`);
  console.log("  done:      only after one real app interaction appears in Agnost");
}

function nextStep(transport, instrumented, envMode) {
  const envStep = {
    file: "restart locally with .env loaded or copy the reported vars into the hosting env before deploy",
    shell: "source .agnost-env.sh locally or copy the reported vars into the hosting env before deploy",
    manual: "set the reported vars in the local shell or hosting env before starting the app",
  }[envMode] || "set the reported vars before starting the app";

  if (instrumented.appTelemetryReady) {
    return transport === "otel"
      ? `${envStep}, then run one real AI interaction so Agnost receives OTLP telemetry`
      : `${envStep}, then run one real AI interaction so Agnost receives SDK telemetry`;
  }
  return `apply ${instrumented.reference} to the real AI call path, ${envStep}, then run one real AI interaction`;
}
