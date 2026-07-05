#!/usr/bin/env node
// send-demo.mjs — send one representative setup event to Agnost for an org,
// through the transport that matches the detected framework. Used to prove the
// org + endpoint + ingestion pipeline work end-to-end in one shot.
//
// Usage:
//   node send-demo.mjs --org-id <id> [--transport ingest|otel] [--mode local|prod]
//                       [--agent <name>] [--session <id>] [--json]
import { endpointsFor, resolveOrgId, captureSession, captureEvent, sendOtlpTrace } from "./lib/agnost.mjs";
import { randomUUID } from "node:crypto";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  const value = process.argv[i + 1];
  return i !== -1 && value && !value.startsWith("--") ? value : def;
}
const jsonOut = process.argv.includes("--json");
const orgId = resolveOrgId({ orgId: arg("org-id", null) });
const transport = arg("transport", "ingest");
const mode = arg("mode", "local");
const agent = arg("agent", "agnost-ai-skill-setup-event");
const session = arg("session", `setup-${randomUUID().slice(0, 8)}`);

if (!["ingest", "otel"].includes(transport)) fail("--transport must be ingest or otel");
if (!["local", "prod"].includes(mode)) fail("--mode must be local or prod");
if (!orgId) {
  fail("no org id. Run provision.mjs first or pass --org-id.");
}

const eps = endpointsFor(mode);

async function viaIngest() {
  const s = await captureSession(eps.ingest, orgId, {
    session_id: session,
    client_config: "agnost-ai-skill-setup-event",
    user_data: { user_id: "setup-user" },
    tools: ["agnost_setup_event"],
  });
  const e = await captureEvent(eps.ingest, orgId, {
    session_id: session,
    primitive_type: "tool",
    primitive_name: "agnost_setup_event",
    latency: 42,
    success: true,
    args: JSON.stringify({ query: "hello agnost" }),
    result: JSON.stringify({ ok: true }),
    metadata: { source: "agnost-ai-skill", agent_name: agent },
  });
  return { transport: "ingest", endpoint: eps.ingest, session, captureSession: s, captureEvent: e };
}

async function viaOtel() {
  const r = await sendOtlpTrace(eps.otel, orgId, {
    name: "ai.generateText",
    durationMs: 120,
    attributes: {
      "ai.telemetry.metadata.sessionId": session,
      "ai.telemetry.metadata.userId": "setup-user",
      "ai.prompt": "Say hello from the Agnost skill",
      "ai.response.text": "Hello from Agnost!",
      "gen_ai.response.model": "agnost-setup-event",
    },
  });
  return { transport: "otel", endpoint: eps.otel, session, otlp: r };
}

const result = transport === "otel" ? await viaOtel() : await viaIngest();
const ok =
  transport === "otel"
    ? result.otlp.ok
    : result.captureSession.ok && result.captureEvent.ok;

result.orgId = orgId;
result.ok = ok;

if (jsonOut) console.log(JSON.stringify(result));
else {
  console.log(`${ok ? "✓" : "✗"} setup event sent via ${result.transport} → ${result.endpoint}`);
  console.log(`  org:      ${orgId}`);
  console.log(`  session:  ${session}`);
}
process.exit(ok ? 0 : 1);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}
