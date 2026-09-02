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

test("LiveKit guidance maps users with user.id", () => {
  const livekitReference = frameworks.match(
    /## livekit agents: native OTLP[\s\S]*?(?=\n## )/,
  )?.[0];

  assert.ok(livekitReference, "missing LiveKit reference section");
  assert.match(livekitReference, /"user\.id": user_id/);
  assert.match(livekitReference, /"user\.id": userId/);
  assert.doesNotMatch(livekitReference, /enduser\.id/);
  assert.match(readme, /### Voice agents[\s\S]*?\| LiveKit Agents/);
  assert.match(skill, /Voice-agent routes:[\s\S]*?#livekit-agents-native-otlp/);
  assert.match(skill, /### Voice agents[\s\S]*?For `livekit-ts` or `livekit-py`/);
  assert.match(skill, /For `livekit-ts` or `livekit-py`[\s\S]*?Use `session\.id`,\n`user\.id`/);
});

test("Retell uses the final analyzed-call webhook instead of OTLP", () => {
  const retellReference = frameworks.match(
    /## retell: call_analyzed webhook[\s\S]*?(?=\n## )/,
  )?.[0];

  assert.ok(retellReference, "missing Retell webhook reference section");
  assert.match(skill, /Retell does not expose a documented OTLP export/);
  assert.match(skill, /enable `call_analyzed`/i);
  assert.match(skill, /do not add an OTel exporter/i);
  assert.match(retellReference, /\/api\/voice\/v1\/webhooks\/retell\?org_id=/);
  assert.match(retellReference, /acknowledges[\s\S]*?`transcript_updated`/i);
  assert.match(retellReference, /Never forward or\nlog the Retell call `access_token`/);
  assert.match(readme, /\| Retell \| `call_analyzed` webhook/);
});
