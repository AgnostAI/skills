#!/usr/bin/env node
// verify.mjs — confirm that events for an org actually landed in Agnost.
// Locally this polls the dev ClickHouse container (conversation + event tables).
//
// Usage:
//   node verify.mjs --org-id <id> [--min-events N] [--timeout-ms N] [--json]
import { execFileSync } from "node:child_process";
import { resolveOrgId } from "../skills/agnost-ai/scripts/lib/agnost.mjs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  const value = process.argv[i + 1];
  return i !== -1 && value && !value.startsWith("--") ? value : def;
}
const jsonOut = process.argv.includes("--json");
const orgId = resolveOrgId({ orgId: arg("org-id", null) });
const minEvents = Number(arg("min-events", "1"));
const timeoutMs = Number(arg("timeout-ms", "20000"));

if (!orgId) {
  console.error("error: no org id. Run provision.mjs first or pass --org-id.");
  process.exit(2);
}
if (!Number.isFinite(minEvents) || minEvents < 1) {
  console.error("error: --min-events must be a positive number");
  process.exit(2);
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
  console.error("error: --timeout-ms must be a positive number");
  process.exit(2);
}

const counts = await pollVerify(orgId, { minEvents, timeoutMs });
const ok = (counts.events || 0) >= minEvents;

if (jsonOut) console.log(JSON.stringify({ orgId, ok, ...counts }));
else {
  console.log(`${ok ? "✓" : "✗"} verification for org ${orgId}`);
  console.log(`  conversations: ${counts.conversations ?? 0}`);
  console.log(`  events:        ${counts.events ?? 0}`);
  if (counts.error) console.log(`  note:          ${counts.error}`);
  if (!ok) console.log(`  expected >= ${minEvents} events`);
}
process.exit(ok ? 0 : 1);

function verifyLocalCounts(orgId, opts = {}) {
  const container = opts.container || process.env.AGNOST_CH_CONTAINER || "agnost-clickhouse-dev";
  const user = opts.user || process.env.CLICKHOUSE_USER || "admin";
  const pass = opts.pass ?? process.env.CLICKHOUSE_PASSWORD ?? "secret";
  const db = opts.db || process.env.CLICKHOUSE_DB || "testanalytics";
  const q = (sql) =>
    execFileSync(
      "docker",
      ["exec", container, "clickhouse-client", "--user", user, "--password", pass, "--database", db, "--query", sql],
      { encoding: "utf8" }
    ).trim();
  const conversations = Number(q(`SELECT count() FROM conversation WHERE org_id=toUUID('${orgId}')`));
  const events = Number(q(`SELECT count() FROM event WHERE org_id=toUUID('${orgId}')`));
  return { conversations, events };
}

async function pollVerify(orgId, { minEvents = 1, timeoutMs = 20000, intervalMs = 1500, ...opts } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = { conversations: 0, events: 0 };
  while (Date.now() < deadline) {
    try {
      last = verifyLocalCounts(orgId, opts);
      if (last.events >= minEvents) return last;
    } catch (e) {
      last.error = String(e.message || e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}
