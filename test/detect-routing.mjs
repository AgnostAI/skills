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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`PASS: ${cases.length} detect-routing cases`);
