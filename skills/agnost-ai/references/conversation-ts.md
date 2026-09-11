## conversation-ts: agnostai

Install:

```bash
npm install agnostai
```

Initialize once near app startup:

```ts
import * as agnost from "agnostai";

agnost.init(process.env.AGNOST_ORG_ID!, {
  endpoint: process.env.AGNOST_ENDPOINT || "https://api.agnost.ai",
});
```

Wrap a known conversation turn:

```ts
const interaction = agnost.begin({
  userId,
  agentName: "support-agent",
  input: userMessage,
});

try {
  const reply = await callModel(userMessage);
  interaction.end(reply, true);
  return reply;
} catch (error) {
  interaction.end(error instanceof Error ? error.message : String(error), false);
  throw error;
}
```

Apply this pattern only after finding the real model or agent handler. Do not
claim integration success from a standalone setup event.
