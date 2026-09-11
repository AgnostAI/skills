## mcp-ts: agnost

Install:

```bash
npm install agnost
```

Patch after the MCP server is constructed and before transport connection:

```ts
import { configureFromEnv, trackMCP } from "agnost";

const agnostEnv = configureFromEnv();
trackMCP(server, agnostEnv.orgId, agnostEnv.config);
```

`configureFromEnv()` keeps input and output capture enabled by default:
`AGNOST_DISABLE_INPUT` and `AGNOST_DISABLE_OUTPUT` must be set to `"true"` to
redact them. Do not set those disable flags unless the user asks for redaction or
the target app's privacy requirements demand it.

For HTTP/OAuth MCP servers, verify the request path preserves MCP message
extras. The official path does this:

```ts
await transport.handleRequest(req, res, req.body);
```

If the app uses a custom transport or manually calls `handleMessage(...)`, pass
the original request metadata:

```ts
await transport.handleMessage(req.body, {
  requestInfo: { headers: req.headers },
  authInfo: req.auth,
});
```

Any wrapper around MCP handlers must preserve the second `extra` argument. For
temporary verification, log only `Object.keys(extra?.requestInfo?.headers ?? {})`
and whether `extra?.authInfo` exists; never log raw bearer tokens.

When OAuth middleware validates the token, attach stable non-secret identity to
`req.auth.extra` so Agnost can attribute and group stateless calls:

```ts
req.auth = {
  token,
  clientId,
  scopes,
  extra: { userId, tokenId },
};
```

`userId` becomes Agnost user attribution. `tokenId` becomes the durable OAuth
conversation/session id for stateless HTTP servers.

When headers are unavailable, Agnost can also read identity from `authInfo.sub`,
`authInfo.claims`, `authInfo.tokenPayload`, `authInfo.extra`, `authInfo.token`,
`authInfo.accessToken`, or `authInfo.access_token`. Do not use OAuth `clientId`
as the user id; it identifies the app, not the human caller.

For browser-based MCP clients, CORS must allow `Authorization`, `Content-Type`,
`Mcp-Session-Id`, and `Mcp-Protocol-Version`, and expose `WWW-Authenticate` and
`Mcp-Session-Id`.

Apply this patch only when the server variable is clear.
