## conversation-py: agnost

Install:

```bash
pip install agnost
```

Initialize once near app startup:

```python
import os
import agnost

agnost.init(
    os.environ["AGNOST_ORG_ID"],
    endpoint=os.getenv("AGNOST_ENDPOINT", "https://api.agnost.ai"),
)
```

Wrap a known conversation turn:

```python
interaction = agnost.begin(
    user_id=user_id,
    agent_name="support-agent",
    input=user_message,
    conversation_id=conversation_id,
)

try:
    reply = call_model(user_message)
    interaction.end(output=reply, success=True)
    return reply
except Exception as exc:
    interaction.end(output=str(exc), success=False)
    raise
```

Apply this pattern only after finding the real model or agent handler. Do not
claim integration success from a standalone setup event.
