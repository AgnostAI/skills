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
