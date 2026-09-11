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
