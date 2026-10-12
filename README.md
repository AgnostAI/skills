# agnost-ai skill

Public agent skill for adding Agnost AI analytics to Python and TypeScript
customer apps.

## Skill Route

Use the `skills/agnost-ai/` directory as the installed agent skill. An AI agent
or CLI tool loads `skills/agnost-ai/SKILL.md`, asks for missing project facts,
inspects existing telemetry, preserves a supported OTel path when its real spans
are usable, otherwise chooses the matching SDK/MCP route, and verifies the full
conversation model with real customer-app interactions after restart/deploy.

Do not make an npm package, global binary, or one-shot runner the product
surface. Bundled scripts are helpers after the route is chosen.

## Install

Once mirrored to the public `AgnostAI/skills` repo, install with:

```bash
npx skills add AgnostAI/skills --skill agnost-ai
```

There is no separate `skill.yml`. The skill manifest is the YAML frontmatter in
`skills/agnost-ai/SKILL.md`, which is what the Vercel Skills CLI discovers and
installs.

## Agent Helper Commands

From the target project root, an agent may call helpers by absolute path:

```bash
node "$SKILL_DIR/scripts/detect.mjs" --dir . --strategy <auto|sdk|otel> --json
node "$SKILL_DIR/scripts/instrument.mjs" --dir . --framework <framework> --org-id <org-id> --mode <local|prod> --env-mode <file|shell|manual> --json
node "$SKILL_DIR/scripts/send-demo.mjs" --org-id <org-id> --transport <ingest|otel> --mode <local|prod> --json
```

`send-demo.mjs` checks transport only. Real verification still requires a
customer chat, agent action, or MCP tool call after restart/deploy.

## Supported Routes

Inspect an existing OTel path before adding another integration. When it emits a
supported span family, keep it and fill only proven identity, hierarchy,
attribute, or metadata gaps. Otherwise use the matching SDK/MCP route below.

### Application and agent frameworks

| Target | Path |
| --- | --- |
| TypeScript conversation app | `agnostai` SDK dependency/env plus real handler wrapping |
| Python conversation app | `agnost` SDK dependency/env plus real handler wrapping |
| TypeScript MCP server | `agnost` MCP wrapper dependency/env plus server patch |
| Python MCP/FastMCP server | `agnost-mcp` wrapper dependency/env plus server patch |
| Vercel AI SDK | Official Agnost OTel exporter setup plus modern AI SDK telemetry option |
| OpenAI SDK | Existing or selected OpenInference + OTLP dependency/env |
| Anthropic SDK | Existing or selected OpenInference + OTLP dependency/env |
| Mastra | OTel dependency/env plus startup observability config |
| Spectrum TS | OTel dependency/env plus app-level message-loop span recipe |
| LangChain | LangSmith/OTLP dependency/env |

### Voice agents

| Target | Path |
| --- | --- |
| LiveKit Agents (Python or TypeScript) | Native LiveKit traces through a standard OTel batch exporter |
| Retell | `call_analyzed` webhook to the Agnost voice endpoint |

When a TypeScript package contains MCP code and regular app/agent/model code,
preserve its supported existing OTel path or use the TypeScript conversation
app path. Reserve the MCP wrapper path for packages whose main surface is a
dedicated MCP server.

For TypeScript MCP servers with OAuth, preserve the official transport request
path or explicitly pass `requestInfo`/`authInfo` through custom transports.
When available, attach non-secret `{ userId, tokenId }` on `req.auth.extra` so
Agnost can attribute the user and group stateless calls by OAuth grant.

Generic app rewrites stay recipe-driven until the real handler shape is known.

Input and output capture is on by default. Negative options such as
`disableInput` / `disableOutput` or `disable_input` / `disable_output` should
stay false or omitted unless the user explicitly wants redaction.

## Env Output

Agents may write `.env`, write shell export lines, or report manual env vars.
Prod integrations require the real dashboard org id.

## Skill Contents

```text
skills/
  agnost-ai/
    SKILL.md
    references/frameworks.md
    scripts/
      provision.mjs
      detect.mjs
      instrument.mjs
      run.mjs
      send-demo.mjs
      lib/agnost.mjs
README.md
TEST-REPORT.md
```

Scripts use Node >= 18 and no runtime dependencies.

Routing, skill-contract, and LiveKit instrumentation tests can be run without
the local dev stack:

```bash
node --test test/detect-routing.mjs test/skill-contract.mjs test/livekit-instrumentation.mjs
```
