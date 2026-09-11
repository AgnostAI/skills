## livekit agents: native OTLP

Official recipe: https://docs.agnost.ai/livekit

LiveKit Agents emits native OpenTelemetry spans for sessions, turns, LLM calls,
tools, speech, and transcription. Keep those spans intact and add one standard
OTLP batch exporter. Room/participant webhooks do not replace this trace path.

Set the env from `env.md`, then install the exporter:

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
