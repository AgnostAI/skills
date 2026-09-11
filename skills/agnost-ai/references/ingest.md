## Direct ingest fallback

When no SDK wrapper is possible, send directly to ingest:

```text
POST {AGNOST_ENDPOINT}/api/v1/capture-session  X-Org-Id: <org-id>
POST {AGNOST_ENDPOINT}/api/v1/capture-event    X-Org-Id: <org-id>
```

This is the ingest path used by `scripts/send-demo.mjs`.
