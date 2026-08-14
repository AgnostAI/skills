---
name: agnost-ai
description: USE to guide an AI agent or CLI tool through adding Agnost AI analytics to a customer Python or TypeScript app from this installed skill directory. Inspect existing telemetry first, preserve a supported OTel path when it produces usable AI spans, otherwise use Agnost SDK/MCP packages, then verify the real conversation data model end to end.
---

# Agnost AI integration

Work from the target app root. This is the skill route: do not tell the user to
install an npm package, use a global binary, or run a package runner. Agents may
call bundled `scripts/` helpers from this installed skill directory, but the
skill contract is the integration workflow.

## Ask first

Before editing, ask only for missing facts:

- Agnost org id from the dashboard.
- Target app/package path if the repo is a monorepo.
- Whether verification should happen in a local app or deployed production app.
- Whether installing Agnost packages is allowed.
- The real AI entrypoint: chat route, agent call, MCP server startup, or tool call.
- How the app is restarted or deployed after env/code changes.

If the org id is absent, stop and ask for it. Do not invent one.

## Choose the route

Inspect existing telemetry before choosing an integration:

- Find any OpenTelemetry provider, exporter, framework instrumentation, env
  configuration, and representative spans from the real AI entrypoint.
- Check whether the emitted span family is supported by Agnost. Supported
  signals include OTel `gen_ai.*`, Vercel AI `ai.*`, OpenInference `llm.*`,
  LiveKit `lk.*`, Mastra, LangSmith, MCP, and custom `tool.*` spans.
- When an existing OpenTelemetry path emits supported spans, preserve it and
  route those spans to Agnost. Do not install a Conversation SDK merely because
  the app is a general TypeScript or Python application.
- Treat automatic OTel detection as a candidate, not proof. Inspect or trigger
  one real interaction and validate the resulting trace with the checklist
  below before declaring that route usable.
- If OTel exists but the real AI path emits no supported spans, add the
  framework's official instrumentation or the smallest missing attributes at
  the real entrypoint. If that cannot produce a faithful conversation model,
  use the matching Agnost SDK/MCP path instead.
- Respect an explicit `--strategy sdk` or `--strategy otel` choice.

Use SDK/MCP integration when there is no usable existing OTel path:

- TypeScript conversation app: install `agnostai`, initialize once, wrap the real
  model/agent call with `begin()` and `end()`.
- Python conversation app: install `agnost`, initialize once, wrap the real
  model/agent call with `begin()`/`end()` or `track_ai()`.
- TypeScript MCP server: install `agnost`, call `configureFromEnv()` and
  `trackMCP(server, orgId, config)` after server construction and before
  transport connection. For HTTP/OAuth MCP servers, preserve the official
  transport request path (`transport.handleRequest(req, res, req.body)`) so
  `extra.requestInfo.headers` reaches Agnost. If the target uses a custom
  transport or manual `handleMessage(...)`, pass
  `{ requestInfo: { headers: req.headers }, authInfo: req.auth }`. If OAuth
  middleware validates the bearer token, attach stable non-secret identity on
  `req.auth.extra` such as `{ userId, tokenId }`; Agnost uses `tokenId` as the
  durable OAuth conversation/session key. If headers are unavailable, Agnost
  can also read identity from `authInfo.sub`, `authInfo.claims`,
  `authInfo.tokenPayload`, `authInfo.extra`, `authInfo.token`,
  `authInfo.accessToken`, or `authInfo.access_token`; never use OAuth
  `clientId` as the user id. Never log raw bearer tokens.
- Python MCP/FastMCP server: install `agnost-mcp`, call `track(server, org_id,
  config(...))` after tool registration and before `run()`. The SDK supports
  stdio, SSE, and stateful/stateless Streamable HTTP. Multiple tracked server
  instances in one process must use the same org ID and config. Without a
  custom sync/async `identify`, built-in identity uses bearer or validated MCP
  auth context without forwarding raw credentials, and identity is cached per
  session key.

If no usable supported OTel route exists and a Node/TypeScript project contains
MCP code but is not solely an MCP server
(for example it also has app, agent, model, OpenAI, Vercel AI SDK, LangChain,
Mastra, Next/React, or API-server code), use its supported existing OTel path or
the TypeScript conversation SDK route (`agnostai`) and instrument the real AI
turn. Use the MCP wrapper route only when the package's main surface is a
dedicated MCP server.

Keep input and output capture enabled by default. For options named
`disableInput`/`disableOutput` (or Python `disable_input`/`disable_output`),
`false` means capture is on. Set them to `true` only when the user explicitly
asks to redact inputs/outputs or the target app's privacy requirements demand it.

Supported OTel recipe targets include LiveKit Agents, Vercel AI SDK, Mastra,
Spectrum TS, LangChain, OpenAI, and other already-instrumented OTel apps.

Do not make a synthetic fetcher or custom OTLP payload path when an official SDK,
MCP wrapper, or framework OTel option exists.

## Validate an OTel route

For a representative real interaction, inspect the emitted trace and the
resulting Agnost user, conversation, turns, events, and tool details. Arrange
attributes at the framework instrumentation or real AI entrypoint when a gap is
found. The route is valid only when all of these checks pass:

1. **User mapping:** use one stable `agnost.user_id`, `enduser.id`, or `user.id`
   for the same customer across all conversations. Verify that two separate
   conversations for that customer map to the same Agnost user and that another
   customer cannot inherit that identity.
2. **Conversation mapping:** use one stable `agnost.session_id`,
   `gen_ai.conversation.id`, or `session.id` for all the events and turns in one
   conversation, including spans exported in separate batches. A new
   conversation must receive a different ID, and its user/assistant turns must
   remain ordered and complete.
3. **Turn and tool hierarchy:** each user-assistant turn must retain its input
   and output. Internal `tool.*`, framework-native tool, or MCP tool spans must
   be child spans of the turn that invoked them, using the real OTel parent span
   ID rather than a custom parent attribute.
4. **AI and SDK attributes:** keep the framework's native attributes and confirm
   model, provider, operation, success/error, and available token counts are on
   the right span. Prefer current GenAI fields such as
   `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens`; retain useful
   SDK-specific `ai.*`, `llm.*`, `lk.*`, Mastra, LangSmith, or MCP attributes.
5. **Custom metadata:** use `user.*` or `enduser.*` for custom user metadata,
   `conversation.*` or `session.*` for custom conversation metadata, and
   non-reserved span attributes for custom event metadata. Put stable values on
   the resource or propagate them to every relevant span; put turn/tool-specific
   values only on the event span they describe.

Fix the narrowest proven gap, restart or redeploy, repeat the same interaction,
and re-check the trace. Do not replace a working framework trace tree with
synthetic spans solely to rename attributes.

## Read the right reference

Open only the matching section from `references/frameworks.md`:

- `#conversation-ts-agnostai`
- `#conversation-py-agnost`
- `#mcp-ts-agnost`
- `#mcp-py-agnost-mcp`
- `#vercel-ai-otlp`
- `#livekit-agents-native-otlp`
- `#openai-openinference-otlp`
- `#mastra-otlp`
- `#spectrum-ts-app-level-otel-spans`
- `#langchain-langsmith-otel-mode`
- `#custom-otel-spans`

For `vercel-ai`, read `references/frameworks.md#vercel-ai-otlp` before editing.
Use the official Agnost recipe only: OTel exporter setup plus
`experimental_telemetry` on modern `generateText`/`streamText`/`generateObject`
calls. If the app uses legacy `OpenAIStream(...)` without a modern call shape,
configure env/deps only if the user chose OTel, then report that app telemetry
requires migrating to a supported Vercel AI SDK call shape or using SDK
instrumentation. Do not generate custom OTLP fetches, synthetic spans, or
wrapper functions.

For `livekit-ts` or `livekit-py`, read
`references/frameworks.md#livekit-agents-native-otlp` before editing. Preserve
LiveKit's native spans: configure a standard OTel batch exporter and call the
framework tracer-provider hook before `AgentSession.start()`. Use `session.id`,
`user.id`, `user.*`, and `conversation.*` metadata. Do not add a
custom span wrapper, synthesize OTLP payloads, or use LiveKit room webhooks as a
substitute for agent traces.

## Backfill existing data

If the user has historical conversations or agent activity, offer to backfill
it before or alongside live instrumentation. Preserve original timestamps and
stable conversation/event relationships, mapping source identifiers to the
required UUIDs. Create each conversation with the
[Capture Session API](https://docs.agnost.ai/capture-session), then send its
turn-pairs and tool calls with the
[Capture Event API](https://docs.agnost.ai/capture-event). Follow the API
reference for event hierarchy, input/output shape, and historical timestamps.

## Script helpers

Scripts are helpers for agents and CLI tools, not the product surface.

Use them only after choosing the route above:

```bash
node "$SKILL_DIR/scripts/detect.mjs" --dir . --strategy <auto|sdk|otel> --json
node "$SKILL_DIR/scripts/instrument.mjs" --dir . --framework <framework> --org-id <org-id> --mode <local|prod> --env-mode <file|shell|manual> --json
node "$SKILL_DIR/scripts/send-demo.mjs" --org-id <org-id> --transport <ingest|otel> --mode <local|prod> --json
```

`detect.mjs` can suggest a route. In `auto` mode it keeps a supported framework's
existing OTel setup, but that suggestion still requires real trace validation.
`instrument.mjs` can apply the narrowest known edit. `send-demo.mjs` can check
whether Agnost accepts traffic, but it does not prove the customer app is
integrated.

## Definition of done

Integration is done only when the user's own application runs locally with the
production Agnost endpoint and emits telemetry from its real code path.

- Set local app env to the real org id and prod endpoints:
  `AGNOST_ORG_ID=<org-id>`, `AGNOST_ENDPOINT=https://api.agnost.ai`, and when
  using OTel, `AGNOST_OTEL_URL=https://otel.agnost.ai`.
- Tell the agent harness/user to run the local application with its normal start
  command after env and code changes are applied.
- Trigger one real chat, agent action, or MCP tool call through that running
  local app.
- Confirm the user, conversation, turns/events, tool hierarchy, attributes, and
  metadata in the Agnost dashboard before saying the integration is complete.

Do not call integration done from `send-demo.mjs`, a standalone SDK snippet, or
any event that bypasses the user's running application.

## Verify

After dependencies, env vars, and code edits:

1. Ask the user to restart the local app or deploy/restart the production app.
2. Ask the user to perform one real chat, agent action, or MCP tool call.
3. Ask the user to check Agnost dashboard raw logs, users, conversations, tools,
   and traces for that real interaction. For OTel, apply the full validation
   checklist above rather than checking only that one span arrived.

Report the route used, files changed, env vars required, restart/deploy step,
and the exact real interaction needed for verification. If no event appears,
inspect app logs and env propagation before adding more code.

## Verification loop

Repeat until the real interaction appears in Agnost or a concrete blocker is
found:

1. Ask for the smallest missing evidence: restart/deploy confirmation, env var
   source, app logs, real interaction timestamp, dashboard screenshot/log, or
   the exact AI entrypoint.
2. Fix only the proven gap.
3. Ask the user to restart/deploy again and repeat the same real interaction.
4. Re-check the Agnost dashboard result before claiming success.
