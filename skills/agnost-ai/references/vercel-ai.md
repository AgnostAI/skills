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
