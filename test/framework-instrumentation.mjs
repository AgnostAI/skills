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
    "--mode", "prod",
    "--env-mode", "file",
    "--json",
  ], { encoding: "utf8" }));
}

test("Vercel AI SDK 7 instrumentation registers the current telemetry integration", () => {
  const dir = mkdtempSync(join(tmpdir(), "agnost-vercel-ai-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "vercel-ai-test",
      private: true,
      type: "module",
      dependencies: { ai: "^7.0.155", next: "^16.0.0" },
    }, null, 2) + "\n");
    writeFileSync(join(dir, "index.ts"), [
      'import { generateText } from "ai";',
      'export const answer = (model) => generateText({ model, prompt: "hello" });',
      '',
    ].join("\n"));

    const first = instrument(dir, "vercel-ai");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const source = readFileSync(join(dir, "index.ts"), "utf8");
    const startup = readFileSync(join(dir, "instrumentation.ts"), "utf8");

    assert.equal(first.appTelemetryReady, true);
    assert.equal(pkg.dependencies["@ai-sdk/otel"], "^1.0.155");
    assert.equal(pkg.dependencies["@opentelemetry/sdk-node"], "^0.300.0");
    assert.match(source, /telemetry:\s*\{ isEnabled: true \}/);
    assert.doesNotMatch(source, /experimental_telemetry/);
    assert.match(startup, /registerTelemetry\(new OpenTelemetry\(\{ runtimeContext: true \}\)\)/);

    const second = instrument(dir, "vercel-ai");
    assert.deepEqual(second.filesChanged, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Spectrum instrumentation uses its native exporter without redundant OTel packages", () => {
  const dir = mkdtempSync(join(tmpdir(), "agnost-spectrum-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "spectrum-test",
      private: true,
      dependencies: { "spectrum-ts": "^12.14.0" },
    }, null, 2) + "\n");
    writeFileSync(join(dir, "index.ts"), "Spectrum({ providers: [], telemetry: true });\n");

    const result = instrument(dir, "spectrum-ts");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const env = readFileSync(join(dir, ".env"), "utf8");

    assert.equal(result.appTelemetryReady, true);
    assert.equal(pkg.dependencies["@opentelemetry/sdk-node"], undefined);
    assert.match(env, /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https:\/\/otel\.agnost\.ai\/v1\/traces/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
