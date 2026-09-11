---
name: agnost-ai
description: Use this skill when adding Agnost AI analytics, tracing, or observability to a Python or TypeScript chat app, agent, MCP server, LiveKit or Retell voice agent, Vercel AI SDK, OpenAI, LangChain, Mastra, or Spectrum project. Inspect existing OpenTelemetry first; keep a supported OTel path or add the Agnost SDK/MCP wrapper, then verify real conversation data — even if the user does not name Agnost.
license: MIT
compatibility: Requires Node.js >= 18 to run bundled scripts.
---

# Agnost AI integration

Work from the target app root. This is the skill route: do not tell the user to
install an npm package, use a global binary, or run a package runner. Agents may
run bundled `scripts/` helpers from this skill directory. Do not read
`scripts/instrument.mjs` into context; run it and use the JSON output.

Resolve the skill root as the directory that contains this `SKILL.md`
(`${CLAUDE_SKILL_DIR}` on Claude Code). Script paths below are relative to that
root.

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
- Retell does not expose a documented OTLP export. For Retell agents, read
  `references/retell.md` and configure the `call_analyzed` webhook; do not use
  Live Monitoring, Analytics, or `transcript_updated` as a trace substitute.
- Treat automatic OTel detection as a candidate, not proof. Inspect or trigger
  one real interaction and validate the resulting trace with the checklist
  below before declaring that route usable.
- If OTel exists but the real AI path emits no supported spans, add the
  framework's official instrumentation or the smallest missing attributes at
  the real entrypoint. If that cannot produce a faithful conversation model,
  use the matching Agnost SDK/MCP path instead.
- Respect an explicit `--strategy sdk` or `--strategy otel` choice.

Use SDK/MCP integration when there is no usable existing OTel path:

- TypeScript conversation app: install `agnostai`, then follow
  `references/conversation-ts.md`.
- Python conversation app: install `agnost`, then follow
  `references/conversation-py.md`.
- TypeScript MCP server: install `agnost`, then follow `references/mcp-ts.md`
  after server construction and before transport connection.
- Python MCP/FastMCP server: install `agnost-mcp`, then follow
  `references/mcp-py.md` after tool registration and before `run()`.

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

Open only the matching file:

- `references/conversation-ts.md`
- `references/conversation-py.md`
- `references/mcp-ts.md`
- `references/mcp-py.md`
- `references/vercel-ai.md`
- `references/openai.md`
- `references/mastra.md`
- `references/spectrum-ts.md`
- `references/langchain.md`
- `references/custom-otel.md`
- `references/env.md`

Voice-agent routes:

- `references/livekit.md`
- `references/retell.md`

For `vercel-ai`, read `references/vercel-ai.md` before editing. Use the official
Agnost recipe only. If the app uses legacy `OpenAIStream(...)` without a modern
call shape, configure env/deps only if the user chose OTel, then report that app
telemetry requires migrating to a supported Vercel AI SDK call shape or using
SDK instrumentation. Do not generate custom OTLP fetches, synthetic spans, or
wrapper functions.

### Voice agents

For `livekit-ts` or `livekit-py`, read `references/livekit.md` before editing.
Preserve LiveKit's native spans. Use `session.id`,
`user.id`, `user.*`, and `conversation.*` metadata. Do not add a
custom span wrapper, synthesize OTLP payloads, or use LiveKit room webhooks as a
substitute for agent traces.

For Retell, read `references/retell.md`. Enable `call_analyzed` on the direct
Agnost webhook URL with the real organization UUID. Do not add an OTel exporter
or ingest incremental `transcript_updated` events.

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
Run them with Node >= 18 after choosing the route above. Pass `--help` for
flags. Prefix paths with the skill root when the working directory is the
target app:

```bash
node scripts/detect.mjs --dir . --strategy <auto|sdk|otel> --json
node scripts/instrument.mjs --dir . --framework <framework> --org-id <org-id> --mode <local|prod> --env-mode <file|shell|manual> --json
node scripts/send-demo.mjs --org-id <org-id> --transport <ingest|otel> --mode <local|prod> --json
```

`detect.mjs` can suggest a route. In `auto` mode it keeps a supported framework's
existing OTel setup, but that suggestion still requires real trace validation.
`instrument.mjs` can apply the narrowest known edit. `send-demo.mjs` can check
whether Agnost accepts traffic, but it does not prove the customer app is
integrated.

Do not run `scripts/run.mjs` on a customer app. It is a local sandbox
orchestrator: it may mint a fake org id and send a setup event. That is not
integration.

`scripts/provision.mjs` is sandbox-only. For customer work, pass `--org-id` from
the dashboard. Never invent an org id.

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
