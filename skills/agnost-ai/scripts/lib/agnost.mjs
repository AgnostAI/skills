// Shared helpers for the agnost-ai skill scripts.
// Zero external dependencies — relies only on Node >= 18 built-ins
// (global fetch, crypto.randomUUID, fs).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ── Endpoints ──────────────────────────────────────────────────────────────
// Customer runs should use prod mode. Local endpoints are for internal sandboxes.
// Use AGNOST_ENDPOINT for ingest and AGNOST_OTEL_URL for OTLP overrides.
export const ENDPOINTS = {
  local: {
    ingest: process.env.AGNOST_ENDPOINT || process.env.AGNOST_INGEST_URL || "http://localhost:8090",
    otel: process.env.AGNOST_OTEL_URL || "http://localhost:8000",
  },
  prod: {
    ingest: process.env.AGNOST_ENDPOINT || process.env.AGNOST_INGEST_URL || "https://api.agnost.ai",
    otel: process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai",
  },
};

export function endpointsFor(mode) {
  return mode === "prod" ? ENDPOINTS.prod : ENDPOINTS.local;
}

// ── Config file (.agnost.json in the target project) ─────────────────────────
export function readConfig(dir = process.cwd()) {
  const p = `${dir}/.agnost.json`;
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function writeConfig(cfg, dir = process.cwd()) {
  const p = `${dir}/.agnost.json`;
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
  return p;
}

// Resolve the org id from (in priority order): explicit arg, .agnost.json,
// AGNOST_ORG_ID env. Returns null when none is set.
export function resolveOrgId({ orgId, dir = process.cwd() } = {}) {
  if (orgId) return orgId;
  const cfg = readConfig(dir);
  if (cfg && cfg.orgId) return cfg.orgId;
  if (process.env.AGNOST_ORG_ID) return process.env.AGNOST_ORG_ID;
  return null;
}

export function newOrgId() {
  return randomUUID();
}

export function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
}

// ── Ingest (Conversation SDK / MCP SDK / direct HTTP path) ───────────────────
export async function captureSession(base, orgId, body) {
  const res = await fetch(`${base}/api/v1/capture-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Org-Id": orgId },
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.status < 300, text: await res.text().catch(() => "") };
}

export async function captureEvent(base, orgId, body) {
  const res = await fetch(`${base}/api/v1/capture-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Org-Id": orgId },
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.status < 300, text: await res.text().catch(() => "") };
}

// ── OTLP (Vercel AI SDK / Mastra / Spectrum / GenAI semconv path) ─────────────
// Sends a minimal OTLP/HTTP-JSON trace with one span through the Agnost OTel
// collector, which classifies it and forwards to ingest.
export async function sendOtlpTrace(otelBase, orgId, span) {
  const now = Date.now() * 1e6; // ns
  const traceId = randomUUID().replace(/-/g, "");
  const spanId = randomUUID().replace(/-/g, "").slice(0, 16);
  const payload = {
    resourceSpans: [
      {
        resource: { attributes: [] },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId,
                name: span.name,
                kind: 1,
                startTimeUnixNano: String(now),
                endTimeUnixNano: String(now + (span.durationMs ?? 5) * 1e6),
                attributes: Object.entries(span.attributes || {}).map(([key, value]) => ({
                  key,
                  value: typeof value === "number"
                    ? { intValue: String(value) }
                    : { stringValue: String(value) },
                })),
                status: {},
              },
            ],
          },
        ],
      },
    ],
  };
  const res = await fetch(`${otelBase}/v1/traces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agnost-Org-ID": orgId },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ok: res.status < 300, text: await res.text().catch(() => "") };
}

export function log(...a) {
  console.log(...a);
}
