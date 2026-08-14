# Agnost integration recipes

Use this file only when `SKILL.md` or a script warning says the target framework
needs a concrete recipe. Preserve an existing supported OTel path when its real
spans pass the `SKILL.md` validation checklist; otherwise use the matching
Agnost SDK/MCP wrapper or the narrowest framework recipe that closes the gap.

## Contents

- [Common env](#common-env)
- [conversation-ts: agnostai](#conversation-ts-agnostai)
- [conversation-py: agnost](#conversation-py-agnost)
- [mcp-ts: agnost](#mcp-ts-agnost)
- [mcp-py: agnost-mcp](#mcp-py-agnost-mcp)
- [vercel-ai: OTLP](#vercel-ai-otlp)
- [livekit agents: native OTLP](#livekit-agents-native-otlp)
- [openai: OpenInference OTLP](#openai-openinference-otlp)
- [mastra: OTLP](#mastra-otlp)
- [spectrum-ts: app-level OTel spans](#spectrum-ts-app-level-otel-spans)
- [langchain: LangSmith OTel mode](#langchain-langsmith-otel-mode)
- [custom: OTel spans](#custom-otel-spans)
- [Direct ingest fallback](#direct-ingest-fallback)

## Common env

```bash
AGNOST_ORG_ID=<org-id-from-dashboard>
AGNOST_ENDPOINT=https://api.agnost.ai
AGNOST_OTEL_URL=https://otel.agnost.ai
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel.agnost.ai/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=X-Agnost-Org-ID=<org-id-from-dashboard>
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

Local dev may override with `AGNOST_ENDPOINT=http://localhost:8090` and
`AGNOST_OTEL_URL=http://localhost:8000`.

## livekit agents: native OTLP

Official recipe: https://docs.agnost.ai/livekit

LiveKit Agents emits native OpenTelemetry spans for sessions, turns, LLM calls,
tools, speech, and transcription. Keep those spans intact and add one standard
OTLP batch exporter. Room/participant webhooks do not replace this trace path.

Set the common OTLP environment variables above, then install the exporter:

```bash
# Python
pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http

# TypeScript (current LiveKit Agents uses OTel SDK 2.x)
npm install @opentelemetry/api @opentelemetry/exporter-trace-otlp-http @opentelemetry/sdk-trace-node
```

Python, before `AgentSession.start()`:

```python
from livekit.agents.telemetry import set_tracer_provider
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
set_tracer_provider(provider, metadata={
    "session.id": conversation_id,
    "user.id": user_id,
    "conversation.channel": "voice",
})
```

TypeScript, before `AgentSession.start()`:

```ts
import { telemetry } from "@livekit/agents";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const fanout = new telemetry.FanoutSpanProcessor();
const provider = new NodeTracerProvider({
  spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter()), fanout],
});
provider.register();
telemetry.setTracerProvider(provider, {
  metadata: { "session.id": conversationId, "user.id": userId },
  registerSpanProcessor: (processor) => fanout.add(processor),
});
```

Use standard metadata:

- `session.id` for the conversation.
- `user.id` for the customer.
- `user.*` for user metadata.
- `conversation.*` for conversation metadata.

LiveKit copies this metadata to its native spans. Agnost also retains every
`lk.*`, `gen_ai.*`, and custom span attribute. Register a shutdown callback that
calls `provider.force_flush()` (Python) or `await provider.shutdown()`
(TypeScript), especially for short-lived workers and tests.

Do not set `LIVEKIT_OBSERVABILITY_URL` to the Agnost endpoint: that variable is
for LiveKit's private Cloud exporter, not a generic OTLP destination.

## conversation-ts: agnostai

Install:

```bash
npm install agnostai
```

Initialize once near app startup:

```ts
import * as agnost from "agnostai";

agnost.init(process.env.AGNOST_ORG_ID!, {
  endpoint: process.env.AGNOST_ENDPOINT || "https://api.agnost.ai",
});
```

Wrap a known conversation turn:

```ts
const interaction = agnost.begin({
  userId,
  agentName: "support-agent",
  input: userMessage,
});

try {
  const reply = await callModel(userMessage);
  interaction.end(reply, true);
  return reply;
} catch (error) {
  interaction.end(error instanceof Error ? error.message : String(error), false);
  throw error;
}
```

Apply this pattern only after finding the real model or agent handler. Do not
claim integration success from a standalone setup event.

## conversation-py: agnost

Install:

```bash
pip install agnost
```

Initialize once near app startup:

```python
import os
import agnost

agnost.init(
    os.environ["AGNOST_ORG_ID"],
    endpoint=os.getenv("AGNOST_ENDPOINT", "https://api.agnost.ai"),
)
```

Wrap a known conversation turn:

```python
interaction = agnost.begin(
    user_id=user_id,
    agent_name="support-agent",
    input=user_message,
    conversation_id=conversation_id,
)

try:
    reply = call_model(user_message)
    interaction.end(output=reply, success=True)
    return reply
except Exception as exc:
    interaction.end(output=str(exc), success=False)
    raise
```

Apply this pattern only after finding the real model or agent handler. Do not
claim integration success from a standalone setup event.

## mcp-ts: agnost

Install:

```bash
npm install agnost
```

Patch after the MCP server is constructed and before transport connection:

```ts
import { configureFromEnv, trackMCP } from "agnost";

const agnostEnv = configureFromEnv();
trackMCP(server, agnostEnv.orgId, agnostEnv.config);
```

`configureFromEnv()` keeps input and output capture enabled by default:
`AGNOST_DISABLE_INPUT` and `AGNOST_DISABLE_OUTPUT` must be set to `"true"` to
redact them. Do not set those disable flags unless the user asks for redaction or
the target app's privacy requirements demand it.

For HTTP/OAuth MCP servers, verify the request path preserves MCP message
extras. The official path does this:

```ts
await transport.handleRequest(req, res, req.body);
```

If the app uses a custom transport or manually calls `handleMessage(...)`, pass
the original request metadata:

```ts
await transport.handleMessage(req.body, {
  requestInfo: { headers: req.headers },
  authInfo: req.auth,
});
```

Any wrapper around MCP handlers must preserve the second `extra` argument. For
temporary verification, log only `Object.keys(extra?.requestInfo?.headers ?? {})`
and whether `extra?.authInfo` exists; never log raw bearer tokens.

When OAuth middleware validates the token, attach stable non-secret identity to
`req.auth.extra` so Agnost can attribute and group stateless calls:

```ts
req.auth = {
  token,
  clientId,
  scopes,
  extra: { userId, tokenId },
};
```

`userId` becomes Agnost user attribution. `tokenId` becomes the durable OAuth
conversation/session id for stateless HTTP servers.

When headers are unavailable, Agnost can also read identity from `authInfo.sub`,
`authInfo.claims`, `authInfo.tokenPayload`, `authInfo.extra`, `authInfo.token`,
`authInfo.accessToken`, or `authInfo.access_token`. Do not use OAuth `clientId`
as the user id; it identifies the app, not the human caller.

For browser-based MCP clients, CORS must allow `Authorization`, `Content-Type`,
`Mcp-Session-Id`, and `Mcp-Protocol-Version`, and expose `WWW-Authenticate` and
`Mcp-Session-Id`.

Apply this patch only when the server variable is clear.

## mcp-py: agnost-mcp

Install:

```bash
pip install agnost-mcp
```

Patch after tools are registered and before the server runs:

```python
import os
from mcp.server.fastmcp import FastMCP
from agnost_mcp import track, config

mcp = FastMCP("my-server")

@mcp.tool()
def search(query: str) -> str:
    return run_search(query)

track(
    mcp,
    os.environ["AGNOST_ORG_ID"],
    config(endpoint=os.environ.get("AGNOST_ENDPOINT", "https://api.agnost.ai")),
)

mcp.run()
```

The `config(...)` defaults keep input and output capture enabled. Do not set
`disable_input=True` or `disable_output=True` unless the user asks for redaction
or the target app's privacy requirements demand it.

The Python wrapper supports stdio, SSE, and stateful/stateless Streamable HTTP.
Keep all tracked server instances in one process on the same org ID and config.
Without a custom sync/async `identify`, it resolves bearer or validated MCP auth
context and never forwards raw credentials. Identity is cached per session key,
so multi-user HTTP servers retain per-session attribution.

## vercel-ai: OTLP

Official recipe: https://docs.agnost.ai/otel-vercel-ai

Install:

```bash
npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-proto
```

Register once at startup. For Next.js apps, create `instrumentation.ts` (or
`src/instrumentation.ts` when the app uses `src/app` or `src/pages`):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-proto");

  new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai"}/v1/traces`,
      headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID || "" },
    }),
  }).start();
}
```

Enable telemetry on Vercel AI calls:

```ts
const result = await generateText({
  model,
  prompt,
  experimental_telemetry: {
    isEnabled: true,
    metadata: { sessionId, userId },
  },
});
```

Add this option when the app uses
`generateText({ ... })`, `streamText({ ... })`, or `generateObject({ ... })`
without `experimental_telemetry`. If the app has `next` installed and no
instrumentation file exists, it also creates the Next.js startup exporter above.

For older Vercel AI apps using `OpenAIStream(...)`, do not generate custom OTLP
payload code. The official Agnost Vercel AI recipe covers modern
`generateText`/`streamText`/`generateObject` calls with `experimental_telemetry`.
Configure env/deps only if the user chose OTel, and report that app telemetry
requires migrating to a supported Vercel AI SDK call shape or using SDK
instrumentation.

## openai: OpenInference OTLP

Official recipe: https://docs.agnost.ai/otel-openai

Install:

```bash
pip install openinference-instrumentation-openai \
  opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
```

```bash
npm install @arizeai/openinference-instrumentation-openai \
  @arizeai/openinference-core @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-proto @opentelemetry/api
```

For TypeScript, pin `@arizeai/openinference-instrumentation-openai` to match
the installed `openai` major:

| `openai` | OpenInference instrumentation |
| --- | --- |
| `^6.7.0` | `^4.0.0` |
| `^4.95.0` through `^5.x` | `~2.3.1` |

Python startup:

```python
import os
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from openinference.instrumentation.openai import OpenAIInstrumentor

provider = TracerProvider(resource=Resource.create({"service.name": "openai-py"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint=f"{os.getenv('AGNOST_OTEL_URL', 'https://otel.agnost.ai').rstrip('/')}/v1/traces",
    headers={"X-Agnost-Org-ID": os.environ["AGNOST_ORG_ID"]},
)))
trace.set_tracer_provider(provider)
OpenAIInstrumentor().instrument(tracer_provider=provider)
```

TypeScript startup:

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OpenAIInstrumentation } from "@arizeai/openinference-instrumentation-openai";

const openAIInstrumentation = new OpenAIInstrumentation();
new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai"}/v1/traces`,
    headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID! },
  }),
  instrumentations: [openAIInstrumentation],
}).start();

import OpenAI from "openai";
openAIInstrumentation.manuallyInstrument(OpenAI as never);
```

Startup wiring and user/session context remain app-specific.

## mastra: OTLP

Install:

```bash
npm install @mastra/observability @mastra/otel-exporter
```

Configure Mastra observability:

```ts
import { Mastra } from "@mastra/core";
import { Observability } from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";

export const mastra = new Mastra({
  agents,
  observability: new Observability({
    configs: {
      default: {
        serviceName: "my-mastra-app",
        exporters: [
          new OtelExporter({
            provider: {
              custom: {
                endpoint: `${process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai"}/v1/traces`,
                headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID! },
                protocol: "http/protobuf",
              },
            },
          }),
        ],
      },
    },
  }),
});
```

Call agents through the Mastra instance so tracing applies.

Add this `observability` block when the app has an ESM `new Mastra({ ... })`
startup object without existing observability config.

## spectrum-ts: app-level OTel spans

Install the app-level OTel exporter dependencies:

```bash
npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-proto @opentelemetry/api
```

Set env before starting the app:

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="${AGNOST_OTEL_URL:-https://otel.agnost.ai}/v1/traces"
export OTEL_EXPORTER_OTLP_HEADERS="X-Agnost-Org-ID=$AGNOST_ORG_ID"
```

Initialize the exporter before processing Spectrum messages:

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { trace } from "@opentelemetry/api";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai"}/v1/traces`,
    headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID || "" },
  }),
});
sdk.start();

const app = await Spectrum({
  providers,
});

const tracer = trace.getTracer("spectrum-ts");

for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;

  const input = message.content.text;
  const output = await runAgent(message.content.text);
  const span = tracer.startSpan("ai.spectrum.message");
  try {
    span.setAttribute("ai.telemetry.metadata.sessionId", space.id);
    span.setAttribute("ai.telemetry.metadata.userId", message.sender?.id || "unknown");
    span.setAttribute("ai.prompt", input);
    span.setAttribute("ai.response.text", output);
    span.setAttribute("gen_ai.response.model", "spectrum-agent");
    span.setAttribute("spectrum.platform", message.platform);
    span.setAttribute("spectrum.message.id", message.id);
    span.setAttribute("spectrum.message.content.type", message.content.type);
    await space.send(output);
  } finally {
    span.end();
  }
}

await sdk.shutdown();
```

Do not rely on Spectrum's `telemetry: true` flag as the Agnost route. In
current `spectrum-ts`, local/direct mode does not initialize an OTLP exporter,
and cloud mode uses Spectrum/Photon telemetry. Use the app-level span above so
the Agnost collector receives a classified AI turn with session, user, input,
and output attributes.

## langchain: LangSmith OTel mode

Official recipe: https://docs.agnost.ai/otel-langchain

Install:

```bash
pip install "langsmith[otel]" opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
```

```bash
npm install langsmith @opentelemetry/api @opentelemetry/context-async-hooks \
  @opentelemetry/sdk-trace-base @opentelemetry/exporter-trace-otlp-proto
```

Initialize before constructing chains or agents.

Python:

```python
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint=f"{os.getenv('AGNOST_OTEL_URL', 'https://otel.agnost.ai').rstrip('/')}/v1/traces",
    headers={"X-Agnost-Org-ID": os.environ["AGNOST_ORG_ID"]},
)))
trace.set_tracer_provider(provider)

os.environ["LANGSMITH_OTEL_ENABLED"] = "true"
os.environ["LANGSMITH_TRACING"] = "true"
os.environ["LANGSMITH_OTEL_ONLY"] = "true"
```

TypeScript:

```ts
process.env.LANGSMITH_TRACING = "true";
process.env.LANGCHAIN_TRACING_V2 = "true";
process.env.LANGSMITH_TRACING_MODE = "otel";

const { initializeOTEL } = await import("langsmith/experimental/otel/setup");

initializeOTEL({
  exporterConfig: {
    url: `${(process.env.AGNOST_OTEL_URL || "https://otel.agnost.ai").replace(/\/$/, "")}/v1/traces`,
    headers: { "X-Agnost-Org-ID": process.env.AGNOST_ORG_ID! },
  },
});
```

Pass session/user metadata on each invoke:

```python
result = agent.invoke(
    {"messages": [{"role": "user", "content": user_message}]},
    config={"metadata": {"session_id": conversation_id, "user_id": user_id}},
)
```

```ts
const result = await chain.invoke(input, {
  metadata: { session_id: conversationId, user_id: userId },
  tags: ["agnost", "langchain-ts"],
});
```

If the app entrypoint is a plain runnable or helper function and no LangSmith
span appears, wrap the real entrypoint with `traceable`. The local sandbox only
emitted LangChain OTLP after this wrapper was present.

Python:

```python
from langsmith import traceable

@traceable(
    name="support-agent",
    run_type="chain",
    metadata={"session_id": conversation_id, "user_id": user_id},
    tags=["agnost", "langchain-py"],
)
def run_agent(user_message: str):
    return agent.invoke({"messages": [{"role": "user", "content": user_message}]})

result = run_agent(user_message)
provider.force_flush()  # CLI scripts/tests only; long-running apps flush on exit.
```

TypeScript:

```ts
const { traceable } = await import("langsmith/traceable");

const runAgent = traceable(
  async (input: string) => chain.invoke(input),
  {
    name: "support-agent",
    run_type: "chain",
    metadata: { session_id: conversationId, user_id: userId },
    tags: ["agnost", "langchain-ts"],
  },
);

const result = await runAgent(userMessage);
```

## custom: OTel spans

For an already-instrumented app without a framework recipe, create an AI span
for each turn with its own `input` and `output`. Create `tool.*` child spans for
tool calls; each child has its own tool `input` and `output`. See the
[custom OTel guide](https://docs.agnost.ai/otel#custom-tool-spans).

### Additional properties

| Type | Fields |
| --- | --- |
| Parent span | `parentSpanId` on the child span |
| GenAI convention attributes | `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` |
| Custom metadata | `customer.tier`, `feature.name`, or another non-reserved OTel attribute |

Keep the completion input/output and GenAI attributes on the parent AI span.
For example, a child named `tool.get_weather` should carry the weather tool's
separate input and output and export the parent span ID as `parentSpanId`.

```python
with tracer.start_as_current_span("chat.completion") as span:
    span.set_attribute("agnost.session_id", session_id)
    span.set_attribute("input", user_message)
    span.set_attribute("gen_ai.request.model", "gpt-5")
    span.set_attribute("customer.tier", "enterprise")

    with tracer.start_as_current_span("tool.get_weather") as tool_span:
        tool_span.set_attribute("input", "San Francisco")
        weather = get_weather("San Francisco")
        tool_span.set_attribute("output", weather)
        tool_span.set_attribute("feature.name", "weather")

    span.set_attribute("output", format_weather_reply(weather))
    span.set_attribute("gen_ai.response.model", "gpt-5-2025-08-07")
    span.set_attribute("gen_ai.usage.input_tokens", 120)
    span.set_attribute("gen_ai.usage.output_tokens", 48)
```

> **Note:** If `agnost.session_id` or another supported session attribute is not
> set, Agnost uses the trace ID as the session ID, so each trace appears as a
> separate session. Reuse a stable session ID to group multiple traces into one
> conversation.

## Direct ingest fallback

When no SDK wrapper is possible, send directly to ingest:

```text
POST {AGNOST_ENDPOINT}/api/v1/capture-session  X-Org-Id: <org-id>
POST {AGNOST_ENDPOINT}/api/v1/capture-event    X-Org-Id: <org-id>
```

This is the ingest path used by `scripts/send-demo.mjs`.
