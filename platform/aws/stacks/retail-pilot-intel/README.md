# stacks/retail-pilot-intel: Retail Pilot Intel docs on the AWS SaaS starter

Task `aws-move-products`, third product. `ventures/retail-pilot-intel/apps/docs` is a Vite
SPA (HashRouter, so every route is `/` plus a fragment) with a client-side passcode, today a
free-plan static-assets Worker, `retail-pilot-intel-docs` (`apps/docs/wrangler.toml`,
deployed by `.github/workflows/priv-retail-pilot-intel-deploy-docs.yml`). Nothing here is
applied: there is no AWS account yet.

| Worker | AWS (this stack) |
|---|---|
| static assets from `dist/`, `not_found_handling = "none"` | the starter's site app (`saas-starter/runtime/src/site.mjs`) serves `dist/`; unknown paths get a plain 404 |
| `public/_headers` (`noindex, nofollow, noarchive`, DENY framing, nosniff, permissions) | `ROBOTS = "noindex, nofollow, noarchive"` plus the site app's default headers; `_headers` and dotfiles are not served |
| client passcode only ("put Cloudflare Access in front" for more) | the same passcode, plus an optional server-side sign-in gate: set `allowed_emails` |
| `retail-pilot-intel-docs.<account>.workers.dev` | `pilot-docs.marisstella.app` (reserved in `stacks/dns/planned.json`) |

Static files only: no D1, KV or R2 data to migrate.

## Apply and cut over

Same steps as `stacks/listing-lens/README.md` ("Apply and cut over"), with this build:
`pnpm docs:build` (with `VITE_DOCS_GATE_ENABLED=true` and the `DOCS_PASSCODE` secret, as the
workflow does), then `node build.mjs site rpi_docs ../../../../../ventures/retail-pilot-intel/apps/docs/dist`
in `saas-starter/runtime`. Accounts are needed only if `allowed_emails` is set. Follow-up after
cutover: remove `apps/docs/wrangler.toml` and the `deploy-cloudflare` job.

## Checks run here (2026-11-25)

```sh
tofu -chdir=platform/aws/stacks/retail-pilot-intel test     # 4 passed (mocks)
node --test platform/aws/stacks/saas-starter/runtime/test/site.test.mjs   # 5 passed (+1 Postgres with PG_SUPERUSER_URL)
# the real build through the bundled Lambda handler: / 200 html, hashed JS immutable, /_headers and /.nojekyll 404
SITE_DIR=ventures/retail-pilot-intel/apps/docs/dist SITE_PAGE=/ \
  node platform/aws/stacks/saas-starter/runtime/test/site-browser.check.mjs   # Chromium, gate on: stranger refused, listed address in
```
