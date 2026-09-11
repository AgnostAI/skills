## mcp-py: agnost-mcp

Install:

```bash
pip install agnost-mcp
```

Patch after tools are registered and before the server runs:

```python
import os
from mcp.server.fastmcp import FastMCP
from agnost_mcp import track, config

mcp = FastMCP("my-server")

@mcp.tool()
def search(query: str) -> str:
    return run_search(query)

track(
    mcp,
    os.environ["AGNOST_ORG_ID"],
    config(endpoint=os.environ.get("AGNOST_ENDPOINT", "https://api.agnost.ai")),
)

mcp.run()
```

The `config(...)` defaults keep input and output capture enabled. Do not set
`disable_input=True` or `disable_output=True` unless the user asks for redaction
or the target app's privacy requirements demand it.

The Python wrapper supports stdio, SSE, and stateful/stateless Streamable HTTP.
Keep all tracked server instances in one process on the same org ID and config.
Without a custom sync/async `identify`, it resolves bearer or validated MCP auth
context and never forwards raw credentials. Identity is cached per session key,
so multi-user HTTP servers retain per-session attribution.
