## retell: call_analyzed webhook

Official Agnost guide: https://docs.agnost.ai/retell

Retell does not expose a documented OTLP export. Configure its account-level or
agent-level webhook URL instead:

```text
https://api.agnost.ai/api/voice/v1/webhooks/retell?org_id=<org-id-from-dashboard>
```

Enable `call_analyzed`. Agnost uses the final transcript, analysis, latency,
cost, and tool-call data. It acknowledges `call_started`, `call_ended`,
`transcript_updated`, transfer, and unknown events without capturing them.

Set `metadata.user_id` or `retell_llm_dynamic_variables.user_id` when a stable
application user ID is available. Phone calls otherwise use the counterparty
number; anonymous web calls fall back to the Retell call ID. Never forward or
log the Retell call `access_token`.

Retell signature verification requires the organization's Retell webhook key.
The direct Agnost endpoint does not verify `X-Retell-Signature`; treat its URL
as sensitive until per-organization signature verification is available.
