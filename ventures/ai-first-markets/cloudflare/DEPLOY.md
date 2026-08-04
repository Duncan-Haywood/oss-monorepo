# Cloudflare Deployment Guide

This project is configured for **Cloudflare Workers** via `@opennextjs/cloudflare`.

## MCP status

The Cloudflare MCP servers connected in Cursor can:

| Server | Status | Useful for |
|--------|--------|------------|
| `Cloudflare-bindings` | Ready | List workers, KV, R2, D1, docs search |
| `Cloudflare-builds` | Ready | Monitor Workers Builds after CI is connected |
| `Cloudflare-observability` | Needs auth | Runtime logs (authenticate in Cursor IDE) |

**Note:** The MCP does not expose a `deploy` tool. Deployment is done via Wrangler CLI, Workers Builds (GitHub), or the Deploy to Cloudflare button.

Current account state (via MCP): **0 workers deployed**.

## Option A — Dashboard + GitHub (recommended)

Connect `Duncan-Haywood/monorepo-projects`, use the `main` branch, and set the
root directory to `ventures/ai-first-markets`.

After connecting, set build secrets in **Workers & Pages → your worker → Settings → Builds → Variables and secrets**:

| Variable | Type | Value |
|----------|------|-------|
| `AUTH_SECRET` | Secret | Random 32+ char string |
| `ALLOWED_EMAIL` | Variable | `duncan.andrew.haywood@gmail.com` |

`ALLOWED_EMAIL` is the sign-in allowlist and accepts a comma-separated list.
It is read per request, so adding an address is a variable edit, not a
release. If it is unset or empty the deployment admits nobody — that is a
misconfiguration and it fails closed rather than opening the site up.

Build command: `npm run build`  
Deploy command: `npm run deploy`

1. Open [Workers & Pages → Create](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)
2. Connect `Duncan-Haywood/monorepo-projects`
3. Select branch `main`
4. Set the root directory to `ventures/ai-first-markets`
5. Configure builds:
   - **Build command:** `npm run build`
   - **Deploy command:** `npm run deploy`
5. Add secrets (see table above)

Wrangler autoconfig may open a PR with any missing files.

## Option B — Local Wrangler deploy

```bash
npm install
npx wrangler login
npx wrangler secret put AUTH_SECRET
npm run deploy
```

Requires `CLOUDFLARE_API_TOKEN` with **Workers Scripts:Edit** permission, or interactive `wrangler login`.

## Enable email whitelist (Cloudflare Access)

After the Worker is deployed:

1. Go to **Workers & Pages → ai-first-markets → Settings → Domains & Routes**
2. On `workers.dev`, click **Enable Cloudflare Access**
3. Click **Manage Cloudflare Access**
4. Edit the Allow policy to include only:
   - **Email:** `duncan.andrew.haywood@gmail.com`
5. Copy `TEAM_DOMAIN` and `POLICY_AUD` from the modal
6. Add them as Worker environment variables:

```
TEAM_DOMAIN=https://your-team.cloudflareaccess.com
POLICY_AUD=<aud-tag-from-modal>
```

The app middleware auto-detects these variables and validates the `cf-access-jwt-assertion` header.

Reference policy: `cloudflare/access-policy.json`

## Option C — GitHub Actions

Add repository secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AUTH_SECRET`), then run the **Deploy AI-First Markets** workflow manually from the Actions tab. The monorepo workflow runs from this venture directory.

## Verify deployment (MCP)

After deploying, ask Cursor to run:

```
Cloudflare-bindings → workers_list
Cloudflare-builds → workers_builds_list_builds (after setting active worker)
```

Or:

```bash
npx wrangler deployments list
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `wrangler whoami` says not authenticated | Run `wrangler login` or set `CLOUDFLARE_API_TOKEN` |
| Build fails on Workers Builds | Add `AUTH_SECRET` to build secrets |
| Access works but app redirects to /login | Set `TEAM_DOMAIN` + `POLICY_AUD` on the Worker |
| Google OAuth fails | Set `NEXT_PUBLIC_APP_URL` to your workers.dev URL |
