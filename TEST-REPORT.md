# agnost-ai skill test report

Status: local sandbox matrix passing against localhost Agnost ingest, OTel, and
ClickHouse on 2026-07-04.

## Verification Scope

The public skill must prove the agent workflow:

1. Agent has the public skills checkout or installed skill directory.
2. Agent asks for org id, target app, install permission, verification target,
   real AI entrypoint, and restart/deploy method.
3. Agent uses SDK/MCP first, OTel only when requested or packages are refused.
4. User restarts/deploys and performs one real chat, agent action, or MCP tool
   call.
5. The real interaction is visible in Agnost dashboard raw logs, conversations,
   tools, or traces.

Local verification should use:

```bash
bash test/run-sandboxes.sh
```

## Sandbox Matrix

| Sandbox | Expected path | Required proof |
| --- | --- | --- |
| `conversation-ts` | `agnostai` SDK/env | package/env changed and a local `agnostai` app turn created events |
| `conversation-ts-sdk-strategy` | default SDK path on an OpenAI TS package | `agnostai` chosen instead of OpenAI OTel |
| `conversation-py` | `agnost` SDK/env | Python dependency/env changed and a local `agnost` app turn created events |
| `conversation-py-sdk-strategy` | default SDK path on a Poetry OpenAI Python package | `agnost` chosen instead of OpenAI OTel |
| `mcp-ts` | `agnost` MCP wrapper | package/env/source changed and MCP event |
| `mcp-py` | `agnost-mcp` SDK/env | Python dependency/env changed and FastMCP recipe available |
| `vercel-ai` | explicit `--strategy otel` env/deps plus known call telemetry | package/env/source changed and OTLP event |
| `vercel-ai-next-startup` | explicit `--strategy otel` Next.js OTLP startup hook | `instrumentation.ts` created and setup OTLP event |
| `openai-ts` | explicit `--strategy otel` OpenInference/OTLP env/deps | package/env changed and a local OpenAI SDK call to a fake OpenAI server emitted OpenInference OTLP |
| `openai-ts-optional` | explicit `--strategy otel` OpenAI in optionalDependencies | OpenAI detected, compatibility version selected, env changed, and OTLP event |
| `openai-ts-peer` | explicit `--strategy otel` OpenAI in peerDependencies | OpenAI detected, compatibility version selected, env changed, and OTLP event |
| `openai-py` | explicit `--strategy otel` OpenInference/OTLP env/deps | Python dependency/env changed and a local OpenAI SDK call to a fake OpenAI server emitted OpenInference OTLP |
| `mastra` | explicit `--strategy otel` env/deps plus known startup observability | package/env/source changed, generated Mastra startup shape constructed, and Mastra-shaped OTLP reached Agnost |
| `spectrum-ts` | explicit `--strategy otel` app-level OTel span around Spectrum messages | package/env changed, no unsafe native telemetry flag inserted, and a local in-memory Spectrum message/reply turn emitted OTLP to Agnost |
| `langchain-ts` | explicit `--strategy otel` LangSmith/OTLP env/deps | package/env changed and a local traced LangChain runnable emitted LangSmith OTLP |
| `langchain-py` | explicit `--strategy otel` Poetry LangSmith/OTLP env/deps | Poetry extras include `otel`, env changed, and a local traced LangChain runnable emitted LangSmith OTLP |
| `langchain-py-requirements` | explicit `--strategy otel` requirements.txt LangSmith/OTLP env/deps | requirements extras include `otel`, no duplicate LangSmith line after rerun, env changed, and OTLP event |
| `langchain-py-pep621` | explicit `--strategy otel` one-line PEP 621 LangSmith/OTLP env/deps | PEP 621 extras include `otel`, no duplicate LangSmith line after rerun, env changed, and OTLP event |

Local result:

```text
PASS (19): conversation-ts conversation-ts-sdk-strategy conversation-py
conversation-py-sdk-strategy mcp-ts mcp-py vercel-ai vercel-ai-next-startup
openai-ts openai-ts-v4 openai-ts-optional openai-ts-peer openai-py mastra
spectrum-ts langchain-ts langchain-py langchain-py-requirements
langchain-py-pep621
FAIL (0): none
```

## Not Covered In This Phase

- Prod dashboard verification without a real dashboard org id.
- Real third-party Spectrum provider credentials/webhooks. The sandbox uses a
  local in-memory Spectrum provider to exercise `Spectrum(...).messages`,
  `message.reply(...)`, and Agnost OTLP transport without external services.
