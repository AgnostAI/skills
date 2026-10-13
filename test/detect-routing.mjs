#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const detectScript = join(root, "skills/agnost-ai/scripts/detect.mjs");

const cases = [
  {
    name: "plain TypeScript app uses conversation SDK",
    pkg: { dependencies: {} },
    wantFramework: "conversation-ts",
  },
  {
    name: "dedicated TypeScript MCP server uses MCP wrapper",
    pkg: { dependencies: { "@modelcontextprotocol/sdk": "*" } },
    wantFramework: "mcp-ts",
  },
  {
    name: "mixed TypeScript app with MCP dependency uses conversation SDK",
    pkg: { dependencies: { "@modelcontextprotocol/sdk": "*", openai: "*" } },
    wantFramework: "conversation-ts",
  },
  {
    name: "Vercel AI app with existing OTel setup keeps native telemetry",
    pkg: {
      dependencies: {
        ai: "*",
        "@opentelemetry/sdk-node": "*",
        "@opentelemetry/exporter-trace-otlp-proto": "*",
      },
    },
    wantFramework: "vercel-ai",
    wantTransport: "otel",
  },
  {
    name: "Anthropic app with existing OTel setup uses OpenInference",
    pkg: { dependencies: { "@anthropic-ai/sdk": "*", "@opentelemetry/sdk-node": "*" } },
    wantFramework: "anthropic-ts",
    wantTransport: "otel",
  },
  {
    name: "app with OpenAI and Anthropic SDKs keeps the OpenAI route",
    pkg: { dependencies: { openai: "*", "@anthropic-ai/sdk": "*", "@opentelemetry/sdk-node": "*" } },
    wantFramework: "openai-ts",
    wantTransport: "otel",
  },
];

for (const testCase of cases) {
  const dir = mkdtempSync(join(tmpdir(), "agnost-detect-"));
  try {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "agnost-detect-test",
        version: "1.0.0",
        type: "module",
        ...testCase.pkg,
      }, null, 2) + "\n"
    );

    const result = JSON.parse(execFileSync(
      process.execPath,
      [detectScript, "--dir", dir, "--json"],
      { encoding: "utf8" }
    ));

    if (result.framework !== testCase.wantFramework) {
      throw new Error(`${testCase.name}: got ${result.framework}, want ${testCase.wantFramework}`);
    }
    if (testCase.wantTransport && result.transport !== testCase.wantTransport) {
      throw new Error(`${testCase.name}: got ${result.transport}, want ${testCase.wantTransport}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = mkdtempSync(join(tmpdir(), "agnost-detect-sdk-override-"));
  try {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "agnost-detect-sdk-override",
        version: "1.0.0",
        type: "module",
        dependencies: {
          ai: "*",
          "@opentelemetry/sdk-node": "*",
        },
      }, null, 2) + "\n"
    );

    const result = JSON.parse(execFileSync(
      process.execPath,
      [detectScript, "--dir", dir, "--strategy", "sdk", "--json"],
      { encoding: "utf8" }
    ));

    if (result.framework !== "conversation-ts" || result.transport !== "ingest") {
      throw new Error(`explicit SDK override: got ${result.framework}/${result.transport}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = mkdtempSync(join(tmpdir(), "agnost-detect-python-otel-"));
  try {
    writeFileSync(
      join(dir, "requirements.txt"),
      "openai\nopentelemetry-sdk\nopentelemetry-exporter-otlp-proto-http\n"
    );

    const result = JSON.parse(execFileSync(
      process.execPath,
      [detectScript, "--dir", dir, "--json"],
      { encoding: "utf8" }
    ));

    if (result.framework !== "openai-py" || result.transport !== "otel") {
      throw new Error(`Python existing OTel route: got ${result.framework}/${result.transport}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const liveKitCases = [
  {
    name: "LiveKit Agents TypeScript uses native OTLP",
    file: "package.json",
    content: JSON.stringify({
      name: "livekit-ts-test",
      version: "1.0.0",
      type: "module",
      dependencies: { "@livekit/agents": "*" },
    }, null, 2) + "\n",
    wantFramework: "livekit-ts",
    wantLanguage: "node",
  },
  {
    name: "LiveKit Agents Python uses native OTLP",
    file: "requirements.txt",
    content: "livekit-agents[openai]\n",
    wantFramework: "livekit-py",
    wantLanguage: "python",
  },
];

for (const testCase of liveKitCases) {
  const dir = mkdtempSync(join(tmpdir(), "agnost-detect-livekit-"));
  try {
    writeFileSync(join(dir, testCase.file), testCase.content);
    const result = JSON.parse(execFileSync(
      process.execPath,
      [detectScript, "--dir", dir, "--strategy", "otel", "--json"],
      { encoding: "utf8" }
    ));

    if (result.framework !== testCase.wantFramework || result.language !== testCase.wantLanguage) {
      throw new Error(`${testCase.name}: got ${result.framework}/${result.language}, want ${testCase.wantFramework}/${testCase.wantLanguage}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`PASS: ${cases.length + liveKitCases.length + 2} detect-routing cases`);
