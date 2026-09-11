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
