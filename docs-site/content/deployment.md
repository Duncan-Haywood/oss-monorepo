# Deployment

This site is deployed to **Cloudflare Pages** and protected by **Cloudflare Access**.

Access is restricted to a single email allowlist. No other identities can reach the docs.

## Allowed identity

| Field | Value |
| --- | --- |
| Email | `duncan.andrew.haywood@gmail.com` |

## Architecture

```text
Browser → Cloudflare Access (email gate) → Cloudflare Pages (static Next.js export)
```

Cloudflare Access runs at the edge before any page is served. Unauthenticated visitors are redirected to the Cloudflare login flow. Only the whitelisted email can complete authentication.

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
| `CLOUDFLARE_API_TOKEN` | API token with Cloudflare Pages edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

### Manual deploy

```bash
cd docs-site
npm run pages:deploy
```

## Cloudflare Access setup

After the first Pages deploy, apply the Access policy:

```bash
cd docs-site
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
export DOCS_HOSTNAME=docs.yourdomain.com   # or *.pages.dev hostname
./scripts/setup-cloudflare-access.sh
```

The script reads `infra/access-policy.json` and creates an Access application plus an allow policy for the single whitelisted email.

### Dashboard alternative

1. Cloudflare Zero Trust → **Access** → **Applications** → **Add an application**
2. Type: **Self-hosted**
3. Application domain: your Pages hostname (e.g. `listing-lens-docs.pages.dev`)
4. Add policy: **Allow** → Include → **Emails** → `duncan.andrew.haywood@gmail.com`
5. Do not add any other include rules

## Security notes

- Access policies are not stored in the static site bundle
- The email whitelist lives in `infra/access-policy.json` and is applied via API or dashboard
- Keep `CLOUDFLARE_API_TOKEN` in CI secrets only
