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
