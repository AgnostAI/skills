# agnost-ai skill

Public agent skill for adding Agnost AI analytics to Python and TypeScript
customer apps.

## Skill Route

Use the `skills/agnost-ai/` directory as the installed agent skill. An AI agent
or CLI tool loads `skills/agnost-ai/SKILL.md`, asks for missing project facts,
chooses SDK/MCP first, uses OTel only when requested, applies the minimal
integration, and verifies with one real customer-app interaction after
restart/deploy.

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

Prefer these in order:

| Target | Path |
| --- | --- |
| TypeScript conversation app | `agnostai` SDK dependency/env plus real handler wrapping |
| Python conversation app | `agnost` SDK dependency/env plus real handler wrapping |
| TypeScript MCP server | `agnost` MCP wrapper dependency/env plus server patch |
| Python MCP/FastMCP server | `agnost-mcp` wrapper dependency/env plus server patch |
| Vercel AI SDK | Official Agnost OTel exporter setup plus modern AI SDK telemetry option |
| OpenAI SDK | OpenInference + OTLP dependency/env only when OTel is requested |
| Mastra | OTel dependency/env plus startup observability config |
| Spectrum TS | OTel dependency/env plus app-level message-loop span recipe |
| LangChain | LangSmith/OTLP dependency/env |

When a TypeScript package contains MCP code and regular app/agent/model code,
prefer the TypeScript conversation app path. Reserve the MCP wrapper path for
packages whose main surface is a dedicated MCP server.

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

Routing-only tests can be run without the local dev stack:

```bash
node test/detect-routing.mjs
```
