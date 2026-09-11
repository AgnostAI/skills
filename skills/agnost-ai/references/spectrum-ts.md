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
