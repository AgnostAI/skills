#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/agnost-ai/SKILL.md"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");
const livekit = readFileSync(join(root, "skills/agnost-ai/references/livekit.md"), "utf8");
const retell = readFileSync(join(root, "skills/agnost-ai/references/retell.md"), "utf8");
const referencesIndex = readFileSync(join(root, "skills/agnost-ai/references/README.md"), "utf8");

function frontmatter(field) {
  const match = skill.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  assert.ok(match, `missing SKILL.md frontmatter field: ${field}`);
  return match[1].trim();
}

test("skill treats an existing supported OTel path as first-class", () => {
  assert.doesNotMatch(skill, /Use OTel only when the user explicitly requests OTel/);
  assert.match(skill, /existing OpenTelemetry/i);
  assert.match(skill, /supported span/i);
  assert.match(skill, /real (interaction|trace)/i);
  assert.doesNotMatch(readme, /uses OTel only when requested/i);
  assert.doesNotMatch(referencesIndex, /use OTel recipes\s+only when the user explicitly asks/i);
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
  assert.match(livekit, /"user\.id": user_id/);
  assert.match(livekit, /"user\.id": userId/);
  assert.doesNotMatch(livekit, /enduser\.id/);
  assert.match(readme, /### Voice agents[\s\S]*?\| LiveKit Agents/);
  assert.match(skill, /Voice-agent routes:[\s\S]*?references\/livekit\.md/);
  assert.match(skill, /### Voice agents[\s\S]*?For `livekit-ts` or `livekit-py`/);
  assert.match(skill, /For `livekit-ts` or `livekit-py`[\s\S]*?Use `session\.id`,\r?\n`user\.id`/);
});

test("Retell uses the final analyzed-call webhook instead of OTLP", () => {
  assert.match(skill, /Retell does not expose a documented OTLP export/);
  assert.match(skill, /enable `call_analyzed`/i);
  assert.match(skill, /do not add an OTel exporter/i);
  assert.match(retell, /\/api\/voice\/v1\/webhooks\/retell\?org_id=/);
  assert.match(retell, /acknowledges[\s\S]*?`transcript_updated`/i);
  assert.match(retell, /Never forward or\nlog the Retell call `access_token`/);
  assert.match(readme, /\| Retell \| `call_analyzed` webhook/);
});

test("skill metadata is portable and triggerable", () => {
  const description = frontmatter("description");
  assert.ok(description.length <= 1024, `description is ${description.length} chars`);
  assert.match(description, /Use this skill when/i);
  assert.match(description, /LiveKit/);
  assert.match(description, /OpenTelemetry|OTel/);
  assert.match(skill, /^license:\s*MIT$/m);
  assert.match(skill, /^compatibility:\s*Requires Node\.js >= 18/m);
  assert.doesNotMatch(skill, /\$SKILL_DIR/);
  assert.doesNotMatch(readme, /\$SKILL_DIR/);
  assert.match(skill, /scripts\/run\.mjs/);
  assert.match(skill, /scripts\/provision\.mjs/);
  assert.match(skill, /Do not run `scripts\/run\.mjs` on a customer app/);
});

test("helper scripts accept --help", () => {
  const scripts = ["detect.mjs", "instrument.mjs", "send-demo.mjs", "provision.mjs", "run.mjs"];
  for (const name of scripts) {
    const output = execFileSync(process.execPath, [join(root, "skills/agnost-ai/scripts", name), "--help"], {
      encoding: "utf8",
    });
    assert.match(output, /Usage:/, `${name} --help should print usage`);
  }
});
