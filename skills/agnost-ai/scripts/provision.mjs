#!/usr/bin/env node
// provision.mjs — obtain an Agnost org id for instrumentation.
//
// Resolution order:
//   1. --org-id <id> | AGNOST_ORG_ID env        → use it as-is
//   2. --local (default for sandboxes)          → generate a fresh org UUID
//   3. --prod with AGNOST_AUTH_URL configured   -> run the Agnost auth ceremony
//      and poll for org id.
//
// On success it writes `.agnost.json` to the target project so the rest of the
// skill (instrument / send setup event / verify) can read the same identity.
//
// Usage:
//   node provision.mjs [--local|--prod] [--org-id <id>] [--name <label>] [--email <e>] [--dir <path>] [--json]
import { writeConfig, resolveOrgId, newOrgId, isUuid, endpointsFor } from "./lib/agnost.mjs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  const value = process.argv[i + 1];
  return i !== -1 && value && !value.startsWith("--") ? value : def;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const dir = arg("dir", process.cwd());
const jsonOut = flag("json");
const name = arg("name", "Agnost Skill");
const email = arg("email", process.env.AGNOST_EMAIL || "");
const mode = flag("prod") ? "prod" : "local";
const eps = endpointsFor(mode);

function out(obj) {
  if (jsonOut) console.log(JSON.stringify(obj));
  else {
    console.log(`✓ org id:   ${obj.orgId}`);
    console.log(`  source:   ${obj.source}`);
    console.log(`  mode:     ${obj.mode}`);
    console.log(`  ingest:   ${obj.endpoints.ingest}`);
    console.log(`  otel:     ${obj.endpoints.otel}`);
    if (obj.configPath) console.log(`  saved:    ${obj.configPath}`);
  }
}

async function ceremony() {
  // Optional Agnost-compatible auth server. Configure with AGNOST_AUTH_URL.
  const authUrl = process.env.AGNOST_AUTH_URL;
  if (!authUrl) return null;
  try {
    const reg = await fetch(`${authUrl}/agent/identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "service_auth", login_hint: email, api_key_name: name }),
    }).then((r) => r.json());

    // Step 3 (mandatory): surface the verification link + code to the user.
    const claim = reg.claim || {};
    console.error("\n── Complete Agnost setup in your browser ──");
    console.error(`URL:  ${claim.verification_uri}`);
    console.error(`CODE: ${claim.user_code}`);
    console.error(`(expires in ${claim.expires_in}s)\n`);

    // Step 5: poll for the org id.
    const interval = (claim.interval || 5) * 1000;
    const deadline = Date.now() + (claim.expires_in || 600) * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));
      const tok = await fetch(`${authUrl}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:workos:agent-auth:grant-type:claim",
          claim_token: reg.claim_token,
        }),
      }).then((r) => r.json());
      if (tok.error === "authorization_pending" || tok.error === "slow_down") continue;
      if (tok.org_id) {
        return { orgId: tok.org_id, source: "ceremony" };
      }
      if (tok.access_token) {
        throw new Error("auth ceremony completed but did not return org_id");
      }
      if (tok.error) throw new Error(tok.error_description || tok.error);
    }
    throw new Error("setup code expired before claim completed");
  } catch (e) {
    console.error(`! registration ceremony failed (${e.message}); falling back`);
    return null;
  }
}

async function main() {
  // 1. Explicit org id (arg / env / existing .agnost.json)
  const explicit = resolveOrgId({ orgId: arg("org-id", null), dir });
  if (explicit) {
    if (!isUuid(explicit) && mode === "local") {
      console.error(`! warning: '${explicit}' is not a UUID; local ingest expects a UUID org id`);
    }
    const cfg = { orgId: explicit, mode, endpoints: eps, source: "explicit" };
    cfg.configPath = writeConfig(cfg, dir);
    return out(cfg);
  }

  // 2. Production ceremony (only if explicitly requested + auth server set)
  if (mode === "prod") {
    const r = await ceremony();
    if (r) {
      const cfg = { orgId: r.orgId, mode, endpoints: eps, source: r.source };
      cfg.configPath = writeConfig(cfg, dir);
      return out(cfg);
    }
    throw new Error("prod mode requires --org-id, AGNOST_ORG_ID, existing .agnost.json, or AGNOST_AUTH_URL");
  }

  // 3. Local sandbox: mint a fresh org id (any UUID is accepted by local ingest)
  const cfg = { orgId: newOrgId(), mode, endpoints: eps, source: "generated-local" };
  cfg.configPath = writeConfig(cfg, dir);
  out(cfg);
}

main().catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
