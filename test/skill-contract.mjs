#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/agnost-ai/SKILL.md"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");
const frameworks = readFileSync(join(root, "skills/agnost-ai/references/frameworks.md"), "utf8");

test("skill treats an existing supported OTel path as first-class", () => {
  assert.doesNotMatch(skill, /Use OTel only when the user explicitly requests OTel/);
  assert.match(skill, /existing OpenTelemetry/i);
  assert.match(skill, /supported span/i);
  assert.match(skill, /real (interaction|trace)/i);
  assert.doesNotMatch(readme, /uses OTel only when requested/i);
  assert.doesNotMatch(frameworks, /use OTel recipes\s+only when the user explicitly asks/i);
});

test("OTel validation covers Agnost conversation fidelity", () => {
  for (const required of [
    "agnost.user_id",
    "agnost.session_id",
    "parent",
    "gen_ai.usage.input_tokens",
    "gen_ai.usage.output_tokens",
    "user.*",
    "conversation.*",
    "event metadata",
  ]) {
    assert.ok(skill.includes(required), `missing OTel validation requirement: ${required}`);
  }
  assert.match(skill, /all (?:the )?conversations/i);
  assert.match(skill, /all (?:the )?(?:events|turns)/i);
  assert.match(skill, /tool spans/i);
});
