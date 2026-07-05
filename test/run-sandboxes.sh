#!/usr/bin/env bash
# run-sandboxes.sh — scaffold a fresh sandbox for each supported framework,
# run the agnost-ai skill flow (detect → provision → instrument → run → verify)
# on it, and report pass/fail. Proves one-shot integration across frameworks
# against the LOCAL Agnost dev stack.
#
# Prereqs: ./dev.sh stack running (backend:8080, ingest:8090, otel:8000,
# ClickHouse container agnost-clickhouse-dev).
#
# Usage: bash test/run-sandboxes.sh [framework ...]   # default: all
set -uo pipefail

PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="${AGNOST_SKILL_DIR:-$PKG/skills/agnost-ai}"
SB="$PKG/test/sandboxes"
ING="${AGNOST_INGEST_URL:-http://localhost:8090}"
OTL="${AGNOST_OTEL_URL:-http://localhost:8000}"
mkdir -p "$SB"

[ -f "$SKILL/scripts/detect.mjs" ] || { echo "skill not found at $SKILL"; exit 1; }

PASS=(); FAIL=()
verify() { AGNOST_ORG_ID="$2" node "$PKG/test/verify.mjs" --org-id "$2" --min-events "${3:-1}" --timeout-ms "${VERIFY_TIMEOUT_MS:-60000}" --json; }
record() { if [ "$1" = 0 ]; then PASS+=("$2"); echo "PASS: $2"; else FAIL+=("$2"); echo "FAIL: $2"; fi; }

# ── conversation-ts ──────────────────────────────────────────────────────────
sb_conversation_ts() {
  local APP="$SB/conversation-ts"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<EOF
{ "name":"sb-conversation-ts","version":"1.0.0","private":true,"type":"module",
  "dependencies":{} }
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --json) || { record 1 conversation-ts; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"agnostai"' package.json || { record 1 conversation-ts; return; }
  grep -Fq "AGNOST_ORG_ID=$ORG" .env || { record 1 conversation-ts; return; }
  grep -Fq "AGNOST_ENDPOINT=$ING" .env || { record 1 conversation-ts; return; }
  npm install --silent >/dev/null 2>&1 || { record 1 conversation-ts; return; }
  cat > app.mjs <<'EOF'
import * as agnost from "agnostai";
agnost.init(process.env.AGNOST_ORG_ID, { endpoint: process.env.AGNOST_ENDPOINT });
const interaction = agnost.begin({
  userId: "local-user",
  agentName: "conversation-ts-demo",
  input: "hello",
  conversationId: "conversation-ts-demo",
});
interaction.end("hi from ts", true);
await agnost.shutdown?.();
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_ENDPOINT="$ING" node app.mjs >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? conversation-ts
}

# ── conversation-ts default SDK strategy on OpenAI package ──────────────────
sb_conversation_ts_sdk_strategy() {
  local APP="$SB/conversation-ts-sdk-strategy"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-conversation-ts-sdk-strategy","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "openai":"latest" } }
EOF
  local RUN ORG FRAMEWORK
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --json) || { record 1 conversation-ts-sdk-strategy; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  FRAMEWORK=$(node -e "console.log(JSON.parse(process.argv[1]).framework)" "$RUN")
  [ "$FRAMEWORK" = "conversation-ts" ] || { record 1 conversation-ts-sdk-strategy; return; }
  grep -Fq '"agnostai"' package.json || { record 1 conversation-ts-sdk-strategy; return; }
  grep -Fq "AGNOST_ENDPOINT=$ING" .env || { record 1 conversation-ts-sdk-strategy; return; }
  verify "$APP" "$ORG" 1 | grep -q '"ok":true'; record $? conversation-ts-sdk-strategy
}

# ── conversation-py ──────────────────────────────────────────────────────────
sb_conversation_py() {
  local APP="$SB/conversation-py"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > pyproject.toml <<'EOF'
[project]
name = "sb-conversation-py"
version = "1.0.0"
dependencies = []
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --json) || { record 1 conversation-py; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"agnost"' pyproject.toml || { record 1 conversation-py; return; }
  grep -Fq "AGNOST_ORG_ID=$ORG" .env || { record 1 conversation-py; return; }
  grep -Fq "AGNOST_ENDPOINT=$ING" .env || { record 1 conversation-py; return; }
  python3 -m venv .venv >/dev/null 2>&1 || { record 1 conversation-py; return; }
  .venv/bin/pip install -q agnost >/dev/null 2>&1 || { record 1 conversation-py; return; }
  cat > app.py <<'EOF'
import os
import agnost

agnost.init(os.environ["AGNOST_ORG_ID"], endpoint=os.environ["AGNOST_ENDPOINT"])
interaction = agnost.begin(
    user_id="local-user",
    agent_name="conversation-py-demo",
    input="hello",
    conversation_id="conversation-py-demo",
)
interaction.end(output="hi from py", success=True)
agnost.shutdown()
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_ENDPOINT="$ING" .venv/bin/python app.py >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? conversation-py
}

# ── conversation-py default SDK strategy on OpenAI package ──────────────────
sb_conversation_py_sdk_strategy() {
  local APP="$SB/conversation-py-sdk-strategy"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > pyproject.toml <<'EOF'
[tool.poetry]
name = "sb-conversation-py-sdk-strategy"
version = "1.0.0"

[tool.poetry.dependencies]
python = "^3.11"
openai = "*"
EOF
  local RUN ORG FRAMEWORK
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --json) || { record 1 conversation-py-sdk-strategy; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  FRAMEWORK=$(node -e "console.log(JSON.parse(process.argv[1]).framework)" "$RUN")
  [ "$FRAMEWORK" = "conversation-py" ] || { record 1 conversation-py-sdk-strategy; return; }
  grep -Fxq 'agnost = "*"' pyproject.toml || { record 1 conversation-py-sdk-strategy; return; }
  grep -Fq "AGNOST_ENDPOINT=$ING" .env || { record 1 conversation-py-sdk-strategy; return; }
  verify "$APP" "$ORG" 1 | grep -q '"ok":true'; record $? conversation-py-sdk-strategy
}

# ── mcp-ts ───────────────────────────────────────────────────────────────────
sb_mcp_ts() {
  local APP="$SB/mcp-ts"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<EOF
{ "name":"sb-mcp-ts","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "@modelcontextprotocol/sdk":"*" } }
EOF
  cat > server.js <<'EOF'
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
const server = new Server({ name:"weather-mcp", version:"1.0.0" }, { capabilities:{ tools:{} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools:[{ name:"get_weather", description:"w", inputSchema:{ type:"object", properties:{ city:{ type:"string" } } } }] }));
server.setRequestHandler(CallToolRequestSchema, async (req) => ({ content:[{ type:"text", text: JSON.stringify({ city: req.params.arguments.city, temp:72 }) }] }));
const [ct, st] = InMemoryTransport.createLinkedPair();
const client = new Client({ name:"c", version:"1.0.0" }, { capabilities:{} });
await Promise.all([server.connect(st), client.connect(ct)]);
await client.callTool({ name:"get_weather", arguments:{ city:"NYC" } });
await new Promise(r=>setTimeout(r,1500)); await client.close(); await server.close(); process.exit(0);
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --json) || { record 1 mcp-ts; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"agnost"' package.json || { record 1 mcp-ts; return; }
  grep -Fq "AGNOST_ORG_ID=$ORG" .env || { record 1 mcp-ts; return; }
  grep -Fq "AGNOST_ENDPOINT=$ING" .env || { record 1 mcp-ts; return; }
  grep -Fq "configureFromEnv" server.js || { record 1 mcp-ts; return; }
  grep -Fq "trackMCP(server" server.js || { record 1 mcp-ts; return; }
  npm install --silent >/dev/null 2>&1
  AGNOST_ORG_ID="$ORG" AGNOST_ENDPOINT="$ING" node server.js >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? mcp-ts
}

# ── mcp-py ───────────────────────────────────────────────────────────────────
sb_mcp_py() {
  local APP="$SB/mcp-py"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > requirements.txt <<'EOF'
fastmcp
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --json) || { record 1 mcp-py; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq "agnost-mcp" requirements.txt || { record 1 mcp-py; return; }
  grep -Fq "AGNOST_ORG_ID=$ORG" .env || { record 1 mcp-py; return; }
  grep -Fq "AGNOST_ENDPOINT=$ING" .env || { record 1 mcp-py; return; }
  verify "$APP" "$ORG" 1 | grep -q '"ok":true'; record $? mcp-py
}

# ── vercel-ai (OTLP, mock model) ─────────────────────────────────────────────
sb_vercel_ai() {
  local APP="$SB/vercel-ai"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-vercel-ai","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "ai":"^4.3.16", "zod":"^3.23.8" } }
EOF
  cat > app.mjs <<'EOF'
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { generateText } from "ai";
import { MockLanguageModelV1 } from "ai/test";
const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: process.env.AGNOST_OTEL_URL + "/v1/traces", headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID } }) });
sdk.start();
const model = new MockLanguageModelV1({ doGenerate: async () => ({ rawCall:{ rawPrompt:null, rawSettings:{} }, finishReason:"stop", usage:{ promptTokens:10, completionTokens:8 }, text:"Hello from Agnost!" }) });
await generateText({ model, prompt:"hi" });
await new Promise(r=>setTimeout(r,500)); await sdk.shutdown();
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 vercel-ai; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"@opentelemetry/sdk-node"' package.json || { record 1 vercel-ai; return; }
  grep -Fq '"@opentelemetry/exporter-trace-otlp-proto"' package.json || { record 1 vercel-ai; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 vercel-ai; return; }
  grep -Fq "experimental_telemetry" app.mjs || { record 1 vercel-ai; return; }
  npm install --silent >/dev/null 2>&1 || { record 1 vercel-ai; return; }
  AGNOST_ORG_ID="$ORG" AGNOST_OTEL_URL="$OTL" node app.mjs >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? vercel-ai
}

# ── vercel-ai Next.js startup hook ───────────────────────────────────────────
sb_vercel_ai_next_startup() {
  local APP="$SB/vercel-ai-next-startup"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-vercel-ai-next-startup","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "ai":"^4.3.16", "next":"^14.2.0" } }
EOF
  cat > route.ts <<'EOF'
import { generateText } from "ai";
export async function POST() {
  return Response.json(await generateText({ model, prompt: "hi" }));
}
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 vercel-ai-next-startup; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq "experimental_telemetry" route.ts || { record 1 vercel-ai-next-startup; return; }
  grep -Fq 'export async function register()' instrumentation.ts || { record 1 vercel-ai-next-startup; return; }
  grep -Fq '@opentelemetry/sdk-node' instrumentation.ts || { record 1 vercel-ai-next-startup; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 vercel-ai-next-startup; return; }
  verify "$APP" "$ORG" 1 | grep -q '"ok":true'; record $? vercel-ai-next-startup
}

# ── openai-ts (OTLP deps/env, startup wiring remains app-specific) ───────────
sb_openai_ts() {
  local APP="$SB/openai-ts"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-openai-ts","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "openai":"latest" } }
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 openai-ts; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"@arizeai/openinference-instrumentation-openai": "^4.0.0"' package.json || { record 1 openai-ts; return; }
  grep -Fq '"@opentelemetry/exporter-trace-otlp-proto"' package.json || { record 1 openai-ts; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 openai-ts; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 openai-ts; return; }
  npm install --silent >/dev/null 2>&1 || { record 1 openai-ts; return; }
  cat > app.mjs <<'EOF'
import { createServer } from "node:http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OpenAIInstrumentation } from "@arizeai/openinference-instrumentation-openai";

const openAIInstrumentation = new OpenAIInstrumentation();
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${process.env.AGNOST_OTEL_URL}/v1/traces`,
    headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID },
  }),
  instrumentations: [openAIInstrumentation],
});
sdk.start();

const server = createServer(async (req, res) => {
  for await (const _chunk of req) {
    // drain request body
  }
  const data = JSON.stringify({
    id: "chatcmpl-local",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "gpt-local",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hello" } }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(data);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const { default: OpenAI } = await import("openai");
openAIInstrumentation.manuallyInstrument(OpenAI);
const client = new OpenAI({ apiKey: "test-key", baseURL: `http://127.0.0.1:${server.address().port}/v1` });
await client.chat.completions.create({ model: "gpt-local", messages: [{ role: "user", content: "hi" }] });
await new Promise((resolve) => setTimeout(resolve, 500));
await sdk.shutdown();
server.close();
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_OTEL_URL="$OTL" node app.mjs >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? openai-ts
}

# ── openai-ts with v4 SDK pin ────────────────────────────────────────────────
sb_openai_ts_v4() {
  local APP="$SB/openai-ts-v4"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-openai-ts-v4","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "openai":"^4.95.0" } }
EOF
  local RUN
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 openai-ts-v4; return; }
  grep -Fq '"@arizeai/openinference-instrumentation-openai": "~2.3.1"' package.json || { record 1 openai-ts-v4; return; }
  grep -Fq '"@opentelemetry/exporter-trace-otlp-proto"' package.json || { record 1 openai-ts-v4; return; }
  node -e "const r=JSON.parse(process.argv[1]); process.exit(r.framework === 'openai-ts' ? 0 : 1)" "$RUN" || { record 1 openai-ts-v4; return; }
  record 0 openai-ts-v4
}

# ── openai-ts optional dependency detection ─────────────────────────────────
sb_openai_ts_optional() {
  local APP="$SB/openai-ts-optional"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-openai-ts-optional","version":"1.0.0","private":true,"type":"module",
  "optionalDependencies":{ "openai":"^4.95.0" } }
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 openai-ts-optional; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"@arizeai/openinference-instrumentation-openai": "~2.3.1"' package.json || { record 1 openai-ts-optional; return; }
  grep -Fq '"optionalDependencies"' package.json || { record 1 openai-ts-optional; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 openai-ts-optional; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 openai-ts-optional; return; }
  node -e "const r=JSON.parse(process.argv[1]); process.exit(r.framework === 'openai-ts' ? 0 : 1)" "$RUN" || { record 1 openai-ts-optional; return; }
  verify "$APP" "$ORG" 1 | grep -q '"ok":true'; record $? openai-ts-optional
}

# ── openai-ts peer dependency detection ─────────────────────────────────────
sb_openai_ts_peer() {
  local APP="$SB/openai-ts-peer"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-openai-ts-peer","version":"1.0.0","private":true,"type":"module",
  "peerDependencies":{ "openai":"^4.95.0" } }
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 openai-ts-peer; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"@arizeai/openinference-instrumentation-openai": "~2.3.1"' package.json || { record 1 openai-ts-peer; return; }
  grep -Fq '"peerDependencies"' package.json || { record 1 openai-ts-peer; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 openai-ts-peer; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 openai-ts-peer; return; }
  node -e "const r=JSON.parse(process.argv[1]); process.exit(r.framework === 'openai-ts' ? 0 : 1)" "$RUN" || { record 1 openai-ts-peer; return; }
  verify "$APP" "$ORG" 1 | grep -q '"ok":true'; record $? openai-ts-peer
}

# ── openai-py (OTLP deps/env, startup wiring remains app-specific) ───────────
sb_openai_py() {
  local APP="$SB/openai-py"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > requirements.txt <<'EOF'
openai
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 openai-py; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq "openinference-instrumentation-openai" requirements.txt || { record 1 openai-py; return; }
  grep -Fq "opentelemetry-exporter-otlp-proto-http" requirements.txt || { record 1 openai-py; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 openai-py; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 openai-py; return; }
  python3 -m venv .venv >/dev/null 2>&1 || { record 1 openai-py; return; }
  .venv/bin/pip install -q -r requirements.txt >/dev/null 2>&1 || { record 1 openai-py; return; }
  cat > app.py <<'EOF'
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from openinference.instrumentation.openai import OpenAIInstrumentor

provider = TracerProvider(resource=Resource.create({"service.name": "openai-py-local"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint=f"{os.environ['AGNOST_OTEL_URL'].rstrip('/')}/v1/traces",
    headers={"X-Agnost-Org-ID": os.environ["AGNOST_ORG_ID"]},
)))
trace.set_tracer_provider(provider)
OpenAIInstrumentor().instrument(tracer_provider=provider)

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        _ = self.rfile.read(int(self.headers.get("content-length", "0")))
        data = json.dumps({
            "id": "chatcmpl-local",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": "gpt-local",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "hello"}}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        }).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        return

server = HTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()

from openai import OpenAI

client = OpenAI(api_key="test-key", base_url=f"http://127.0.0.1:{server.server_port}/v1")
client.chat.completions.create(model="gpt-local", messages=[{"role": "user", "content": "hi"}])
provider.force_flush()
server.shutdown()
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_OTEL_URL="$OTL" .venv/bin/python app.py >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? openai-py
}

# ── mastra (OTLP, Mastra-shaped spans) ───────────────────────────────────────
sb_mastra() {
  local APP="$SB/mastra"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-mastra","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "@mastra/core":"latest", "@opentelemetry/sdk-node":"^0.52.1", "@opentelemetry/exporter-trace-otlp-http":"^0.52.1", "@opentelemetry/api":"^1.9.0" } }
EOF
  cat > mastra.ts <<'EOF'
import { Mastra } from "@mastra/core";

export const mastra = new Mastra({
  agents: {},
});
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 mastra; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"@mastra/observability"' package.json || { record 1 mastra; return; }
  grep -Fq '"@mastra/otel-exporter"' package.json || { record 1 mastra; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 mastra; return; }
  grep -Fq 'OtelExporter' mastra.ts || { record 1 mastra; return; }
  grep -Fq 'Observability' mastra.ts || { record 1 mastra; return; }
  grep -Fq 'observability' mastra.ts || { record 1 mastra; return; }
  npm install --silent >/dev/null 2>&1 || { record 1 mastra; return; }
  cat > mastra-runtime.mjs <<'EOF'
import { Mastra } from "@mastra/core";
import { OtelExporter } from "@mastra/otel-exporter";
import { Observability } from "@mastra/observability";

new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: "agnost-mastra-app",
        exporters: [
          new OtelExporter({
            provider: {
              custom: {
                endpoint: `${process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai"}/v1/traces`,
                headers: { "X-Agnost-Org-ID": String(process.env.AGNOST_ORG_ID || "") },
                protocol: "http/protobuf",
              },
            },
          }),
        ],
      },
    },
  }),
  agents: {},
});
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_OTEL_URL="$OTL" node mastra-runtime.mjs >/dev/null 2>&1 || { record 1 mastra; return; }
  cat > app.mjs <<'EOF'
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { trace } from "@opentelemetry/api";
const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: process.env.AGNOST_OTEL_URL + "/v1/traces", headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID } }) });
sdk.start();
const t = trace.getTracer("mastra");
t.startActiveSpan("agent run weather-agent", (p) => {
  p.setAttribute("mastra.span.type","agent_run"); p.setAttribute("gen_ai.agent.name","weather-agent");
  p.setAttribute("mastra.metadata.sessionId","mastra-demo"); p.setAttribute("mastra.agent_run.output","72F sunny");
  t.startActiveSpan("model generation", (c) => {
    c.setAttribute("mastra.span.type","model_generation"); c.setAttribute("gen_ai.response.model","gpt-4o");
    c.setAttribute("mastra.metadata.sessionId","mastra-demo"); c.end();
  });
  p.end();
});
await new Promise(r=>setTimeout(r,500)); await sdk.shutdown();
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_OTEL_URL="$OTL" node app.mjs >/dev/null 2>&1
  verify "$APP" "$ORG" 3 | grep -q '"ok":true'; record $? mastra
}

# ── spectrum-ts (app-level OTLP span around local message loop) ──────────────
sb_spectrum_ts() {
  local APP="$SB/spectrum-ts"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-spectrum-ts","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "spectrum-ts":"latest", "zod":"^4.0.0" } }
EOF
  cat > app.ts <<'EOF'
import { Spectrum } from "spectrum-ts";
await Spectrum({
  providers: [],
});
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 spectrum-ts; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 spectrum-ts; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=$OTL/v1/traces" .env || { record 1 spectrum-ts; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 spectrum-ts; return; }
  grep -Fq '"@opentelemetry/sdk-node"' package.json || { record 1 spectrum-ts; return; }
  grep -Fq '"@opentelemetry/exporter-trace-otlp-proto"' package.json || { record 1 spectrum-ts; return; }
  grep -Fq '"@opentelemetry/api"' package.json || { record 1 spectrum-ts; return; }
  ! grep -Fq "telemetry: true" app.ts || { record 1 spectrum-ts; return; }
  npm install --silent >/dev/null 2>&1 || { record 1 spectrum-ts; return; }
  cat > app.mjs <<'EOF'
import { Spectrum, definePlatform, text } from "spectrum-ts";
import { z } from "zod";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { trace } from "@opentelemetry/api";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${process.env.AGNOST_OTEL_URL}/v1/traces`,
    headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID },
  }),
});
sdk.start();

const memory = definePlatform("memory", {
  config: z.object({}),
  lifecycle: { createClient: async () => ({}) },
  user: { resolve: async ({ input }) => ({ id: input.userID }) },
  space: {
    create: async () => ({ id: "room-1" }),
    get: async ({ input }) => ({ id: input.id }),
  },
  messages: async function* () {
    yield {
      id: "in-1",
      content: await text("hello from memory").build(),
      sender: { id: "local-user" },
      space: { id: "room-1" },
      timestamp: new Date(),
    };
  },
  send: async ({ content, space }) => ({
    id: "out-1",
    direction: "outbound",
    content,
    space,
    timestamp: new Date(),
  }),
});

const app = await Spectrum({ providers: [memory.config()] });
const tracer = trace.getTracer("spectrum-ts-local");

for await (const [space, message] of app.messages) {
  const input = message.content.type === "text" ? message.content.text : message.content.type;
  const output = "hello from app";
  const span = tracer.startSpan("ai.spectrum.message");
  try {
    span.setAttribute("ai.telemetry.metadata.sessionId", space.id);
    span.setAttribute("ai.telemetry.metadata.userId", message.sender?.id || "unknown");
    span.setAttribute("ai.prompt", input);
    span.setAttribute("ai.response.text", output);
    span.setAttribute("gen_ai.response.model", "spectrum-local-agent");
    span.setAttribute("spectrum.platform", message.platform);
    span.setAttribute("spectrum.message.id", message.id);
    span.setAttribute("spectrum.message.content.type", message.content.type);
    await message.reply(output);
  } finally {
    span.end();
  }
  break;
}

await app.stop();
await sdk.shutdown();
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_OTEL_URL="$OTL" LOG_LEVEL=silent node app.mjs >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? spectrum-ts
}

# ── langchain-ts (OTLP deps/env, startup wiring remains app-specific) ────────
sb_langchain_ts() {
  local APP="$SB/langchain-ts"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > package.json <<'EOF'
{ "name":"sb-langchain-ts","version":"1.0.0","private":true,"type":"module",
  "dependencies":{ "langchain":"latest" } }
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 langchain-ts; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq '"langsmith"' package.json || { record 1 langchain-ts; return; }
  grep -Fq '"@opentelemetry/exporter-trace-otlp-proto"' package.json || { record 1 langchain-ts; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 langchain-ts; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 langchain-ts; return; }
  grep -Fq "LANGSMITH_TRACING=true" .env || { record 1 langchain-ts; return; }
  grep -Fq "LANGCHAIN_TRACING_V2=true" .env || { record 1 langchain-ts; return; }
  grep -Fq "LANGSMITH_TRACING_MODE=otel" .env || { record 1 langchain-ts; return; }
  npm install --silent >/dev/null 2>&1 || { record 1 langchain-ts; return; }
  cat > app.mjs <<'EOF'
process.env.LANGSMITH_TRACING = "true";
process.env.LANGCHAIN_TRACING_V2 = "true";
process.env.LANGSMITH_TRACING_MODE = "otel";

const { initializeOTEL } = await import("langsmith/experimental/otel/setup");
const components = initializeOTEL({
  exporterConfig: {
    url: `${process.env.AGNOST_OTEL_URL.replace(/\/$/, "")}/v1/traces`,
    headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID },
  },
});
const { traceable } = await import("langsmith/traceable");
const { RunnableLambda } = await import("@langchain/core/runnables");
const chain = RunnableLambda.from(async (input) => `hello ${input}`);
const tracedInvoke = traceable(async (input) => chain.invoke(input), {
  name: "langchain-ts-demo",
  run_type: "chain",
  metadata: { session_id: "langchain-ts-demo", user_id: "local-user" },
  tags: ["agnost", "langchain-ts"],
});
await tracedInvoke("agnost");
await new Promise((resolve) => setTimeout(resolve, 1000));
await components.DEFAULT_LANGSMITH_TRACER_PROVIDER.forceFlush();
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_OTEL_URL="$OTL" node app.mjs >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? langchain-ts
}

# ── langchain-py (OTLP deps/env, startup wiring remains app-specific) ────────
sb_langchain_py() {
  local APP="$SB/langchain-py"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > pyproject.toml <<'EOF'
[tool.poetry]
name = "sb-langchain-py"
version = "1.0.0"

[tool.poetry.dependencies]
python = "^3.11"
langchain = "*"
langsmith = { version = "^0.2.0", markers = "python_version >= '3.11'", extras = ["traceable"] }
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 langchain-py; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  grep -Fq 'langsmith = { version = "^0.2.0", markers = "python_version >= '"'"'3.11'"'"'", extras = ["traceable", "otel"] }' pyproject.toml || { record 1 langchain-py; return; }
  grep -Fq 'opentelemetry-exporter-otlp-proto-http = "*"' pyproject.toml || { record 1 langchain-py; return; }
  grep -Fq "AGNOST_OTEL_URL=$OTL" .env || { record 1 langchain-py; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 langchain-py; return; }
  grep -Fq "LANGSMITH_OTEL_ENABLED=true" .env || { record 1 langchain-py; return; }
  grep -Fq "LANGSMITH_TRACING=true" .env || { record 1 langchain-py; return; }
  grep -Fq "LANGSMITH_OTEL_ONLY=true" .env || { record 1 langchain-py; return; }
  python3 -m venv .venv >/dev/null 2>&1 || { record 1 langchain-py; return; }
  .venv/bin/pip install -q "langsmith[otel]" opentelemetry-sdk opentelemetry-exporter-otlp-proto-http langchain >/dev/null 2>&1 || { record 1 langchain-py; return; }
  cat > app.py <<'EOF'
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from langsmith import traceable
from langchain_core.runnables import RunnableLambda

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint=f"{os.environ['AGNOST_OTEL_URL'].rstrip('/')}/v1/traces",
    headers={"X-Agnost-Org-ID": os.environ["AGNOST_ORG_ID"]},
)))
trace.set_tracer_provider(provider)

os.environ["LANGSMITH_OTEL_ENABLED"] = "true"
os.environ["LANGSMITH_TRACING"] = "true"
os.environ["LANGSMITH_OTEL_ONLY"] = "true"

chain = RunnableLambda(lambda text: f"hello {text}")

@traceable(name="langchain-py-demo", run_type="chain", metadata={"session_id": "langchain-py-demo", "user_id": "local-user"}, tags=["agnost", "langchain-py"])
def run_chain(text: str) -> str:
    return chain.invoke(text)

run_chain("agnost")
provider.force_flush()
EOF
  AGNOST_ORG_ID="$ORG" AGNOST_OTEL_URL="$OTL" .venv/bin/python app.py >/dev/null 2>&1
  verify "$APP" "$ORG" 2 | grep -q '"ok":true'; record $? langchain-py
}

# ── langchain-py requirements.txt extras merge ──────────────────────────────
sb_langchain_py_requirements() {
  local APP="$SB/langchain-py-requirements"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > requirements.txt <<'EOF'
langchain
langsmith[traceable]
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 langchain-py-requirements; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json >/dev/null || { record 1 langchain-py-requirements; return; }
  grep -Fq 'langsmith[traceable,otel]' requirements.txt || { record 1 langchain-py-requirements; return; }
  [ "$(grep -Fc 'langsmith[' requirements.txt)" = "1" ] || { record 1 langchain-py-requirements; return; }
  grep -Fq 'opentelemetry-exporter-otlp-proto-http' requirements.txt || { record 1 langchain-py-requirements; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 langchain-py-requirements; return; }
  verify "$APP" "$ORG" 1 | grep -q '"ok":true'; record $? langchain-py-requirements
}

# ── langchain-py PEP 621 extras merge ───────────────────────────────────────
sb_langchain_py_pep621() {
  local APP="$SB/langchain-py-pep621"; rm -rf "$APP"; mkdir -p "$APP"; cd "$APP"
  cat > pyproject.toml <<'EOF'
[project]
name = "sb-langchain-py-pep621"
version = "1.0.0"
dependencies = ["langchain", "langsmith[traceable]"]
EOF
  local RUN ORG
  RUN=$(node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json) || { record 1 langchain-py-pep621; return; }
  ORG=$(node -e "console.log(JSON.parse(process.argv[1]).orgId)" "$RUN")
  node "$SKILL/scripts/run.mjs" --dir "$APP" --strategy otel --json >/dev/null || { record 1 langchain-py-pep621; return; }
  grep -Fq '"langsmith[traceable,otel]"' pyproject.toml || { record 1 langchain-py-pep621; return; }
  [ "$(grep -Fc 'langsmith[' pyproject.toml)" = "1" ] || { record 1 langchain-py-pep621; return; }
  grep -Fq '"opentelemetry-exporter-otlp-proto-http"' pyproject.toml || { record 1 langchain-py-pep621; return; }
  grep -Fq "OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=$ORG" .env || { record 1 langchain-py-pep621; return; }
  verify "$APP" "$ORG" 1 | grep -q '"ok":true'; record $? langchain-py-pep621
}

ALL=(conversation-ts conversation-ts-sdk-strategy conversation-py conversation-py-sdk-strategy mcp-ts mcp-py vercel-ai vercel-ai-next-startup openai-ts openai-ts-v4 openai-ts-optional openai-ts-peer openai-py mastra spectrum-ts langchain-ts langchain-py langchain-py-requirements langchain-py-pep621)
TARGETS=("$@"); [ ${#TARGETS[@]} -eq 0 ] && TARGETS=("${ALL[@]}")
for t in "${TARGETS[@]}"; do
  echo "── $t ──"
  case "$t" in
    conversation-ts) sb_conversation_ts;;
    conversation-ts-sdk-strategy) sb_conversation_ts_sdk_strategy;;
    conversation-py) sb_conversation_py;;
    conversation-py-sdk-strategy) sb_conversation_py_sdk_strategy;;
    mcp-ts) sb_mcp_ts;;
    mcp-py) sb_mcp_py;;
    vercel-ai) sb_vercel_ai;;
    vercel-ai-next-startup) sb_vercel_ai_next_startup;;
    openai-ts) sb_openai_ts;;
    openai-ts-v4) sb_openai_ts_v4;;
    openai-ts-optional) sb_openai_ts_optional;;
    openai-ts-peer) sb_openai_ts_peer;;
    openai-py) sb_openai_py;;
    mastra) sb_mastra;;
    spectrum-ts) sb_spectrum_ts;;
    langchain-ts) sb_langchain_ts;;
    langchain-py) sb_langchain_py;;
    langchain-py-requirements) sb_langchain_py_requirements;;
    langchain-py-pep621) sb_langchain_py_pep621;;
    *) echo "unknown framework: $t";;
  esac
done

echo
echo "════════ RESULTS ════════"
echo "PASS (${#PASS[@]}): ${PASS[*]:-none}"
echo "FAIL (${#FAIL[@]}): ${FAIL[*]:-none}"
[ ${#FAIL[@]} -eq 0 ]
