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
