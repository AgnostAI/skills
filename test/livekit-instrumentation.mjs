#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const instrumentScript = join(root, "skills/agnost-ai/scripts/instrument.mjs");
const orgId = "22222222-2222-4222-8222-222222222222";

function instrument(dir, framework) {
  return JSON.parse(execFileSync(process.execPath, [
    instrumentScript,
    "--dir", dir,
    "--framework", framework,
    "--org-id", orgId,
    "--mode", "local",
    "--env-mode", "file",
    "--json",
  ], { encoding: "utf8" }));
}

test("LiveKit TypeScript instrumentation adds current OTel 2.x dependencies and env", () => {
  const dir = mkdtempSync(join(tmpdir(), "agnost-livekit-ts-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "livekit-ts-test",
      version: "1.0.0",
      dependencies: { "@livekit/agents": "*" },
    }, null, 2) + "\n");

    const first = instrument(dir, "livekit-ts");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const env = readFileSync(join(dir, ".env"), "utf8");

    assert.equal(first.reference, "references/frameworks.md#livekit-agents-native-otlp");
    assert.equal(first.appTelemetryReady, false);
    assert.equal(pkg.dependencies["@opentelemetry/api"], "^1.9.0");
    assert.equal(pkg.dependencies["@opentelemetry/exporter-trace-otlp-http"], "^0.220.0");
    assert.equal(pkg.dependencies["@opentelemetry/sdk-trace-node"], "^2.8.0");
    assert.match(env, /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http:\/\/localhost:8000\/v1\/traces/);
    assert.match(env, new RegExp(`OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=${orgId}`));

    const second = instrument(dir, "livekit-ts");
    assert.deepEqual(second.filesChanged, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("LiveKit Python instrumentation preserves LiveKit and adds OTLP exporter requirements", () => {
  const dir = mkdtempSync(join(tmpdir(), "agnost-livekit-py-"));
  try {
    writeFileSync(join(dir, "requirements.txt"), "livekit-agents[openai]\n");

    const first = instrument(dir, "livekit-py");
    const requirements = readFileSync(join(dir, "requirements.txt"), "utf8");

    assert.equal(first.reference, "references/frameworks.md#livekit-agents-native-otlp");
    assert.match(requirements, /^livekit-agents\[openai\]$/m);
    assert.match(requirements, /^opentelemetry-sdk$/m);
    assert.match(requirements, /^opentelemetry-exporter-otlp-proto-http$/m);

    const second = instrument(dir, "livekit-py");
    assert.deepEqual(second.filesChanged, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
