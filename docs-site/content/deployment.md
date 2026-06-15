# Deployment

This site is a **Next.js** static export deployed to **Cloudflare Pages** and protected by **Cloudflare Access**.

Access is restricted to a single email allowlist. No other identities can reach the docs.

## Live URL

**https://listing-lens-docs.pages.dev**

## Allowed identity

| Field | Value |
| --- | --- |
| Email | `duncan.andrew.haywood@gmail.com` |

## Architecture

```text
Browser → Cloudflare Access (email gate) → Cloudflare Pages (static Next.js export)
```

Cloudflare Access runs at the edge before any page is served. Unauthenticated visitors are prompted to authenticate via Cloudflare Access (one-time PIN to the whitelisted email). Only `duncan.andrew.haywood@gmail.com` can complete authentication.

## Local development

```bash
cd docs-site
npm install
npm run dev
```

Local dev does not enforce Access. Production is protected at the Cloudflare edge.

## Production build

```bash
cd docs-site
npm run build
```

Static files are written to `docs-site/out/`.

## Deploy

### GitHub Actions (recommended)

Push to `main` triggers `.github/workflows/deploy-docs.yml` when `docs-site/**` changes.

Required repository secrets:

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with Cloudflare Pages + Zero Trust edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

### Manual deploy

```bash
cd docs-site
npm run pages:deploy
```

## Cloudflare Access setup

After the first Pages deploy, apply the Access policy:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
export DOCS_HOSTNAME=listing-lens-docs.pages.dev
./docs-site/scripts/setup-cloudflare-access.sh
```

The script attaches reusable Zero Trust policies (`duncan-only` allow + `whitelist-only` deny) and the one-time PIN identity provider for `duncan.andrew.haywood@gmail.com`.

**Important:** Do not create self-hosted Access apps for `*.workers.dev` hostnames — use Workers Settings → Enable Cloudflare Access instead. For Pages, use the script above or the dashboard steps below.

### Dashboard alternative

1. Cloudflare Zero Trust → **Access** → **Applications** → **Add an application**
2. Type: **Self-hosted**
3. Application domain: `listing-lens-docs.pages.dev`
4. Identity provider: **One-time PIN**
5. Policy: **Allow** → Include → **Emails** → `duncan.andrew.haywood@gmail.com`
6. Policy: **Deny** → Include → **Everyone**
7. Enable the **Access App Launcher** in Zero Trust settings so the login flow works

## Security notes

- Access policies are not stored in the static site bundle
- The email whitelist lives in `infra/access-policy.json` and is applied via API or dashboard
- Keep `CLOUDFLARE_API_TOKEN` in CI secrets only
