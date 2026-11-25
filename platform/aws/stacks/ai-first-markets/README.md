# stacks/ai-first-markets: AI-First Markets on the AWS SaaS starter

Task `aws-move-products`, fourth product (last by paid potential: `NOT-A-VENTURE`, the owner's
market notes). Today a Cloudflare Worker built with OpenNext (`wrangler.jsonc`,
`.github/workflows/priv-ai-first-markets-deploy.yml`, manual dispatch), with its own sign-in:
`middleware.ts`, a Google OAuth callback, a session JWT signed with `AUTH_SECRET`, one
`ALLOWED_EMAIL`, optionally Cloudflare Access. Nothing here is applied: there is no AWS account yet.

## What replaces what

| Worker (OpenNext) | AWS (this stack) |
|---|---|
| Next.js server on the Worker | `ventures/ai-first-markets/aws/build.mjs`: `output: "export"` (every page is static data in `src/data`), served by the starter's site app |
| middleware + Google OAuth + `AUTH_SECRET` session + `ALLOWED_EMAIL` | the site app's sign-in gate: Cognito (no self sign-up, MFA on), ID token checked by API Gateway, 12 h HMAC cookie; `allowed_emails` |
| `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` secrets | none: the gate's key is a row in the product database |
| `ai-first-markets.<account>.workers.dev` | `markets.marisstella.app` (reserved in `stacks/dns/planned.json`) |

No D1, KV or R2 bindings: nothing to migrate. One source change was needed for static export:
`src/app/sitemap.ts` is marked `force-static` (no effect on the Worker build).

## Apply and cut over

Same steps as `stacks/listing-lens/README.md`, with this build: `npm ci && node aws/build.mjs`
in `ventures/ai-first-markets`, then `node build.mjs site ai_first_markets ../../../../../ventures/ai-first-markets/aws/out`
in `saas-starter/runtime`. Follow-up after cutover: remove `wrangler.jsonc`, `open-next.config.ts`,
`cloudflare/`, the OpenNext and wrangler dependencies, the auth code the gate replaced, and
the deploy workflow.

## Checks run here (2026-11-25)

```sh
tofu -chdir=platform/aws/stacks/ai-first-markets test        # 3 passed (mocks)
(cd ventures/ai-first-markets && node aws/build.mjs)          # 0: 20 page directories (index.html) (/, /ideas/*, /reports/*, /market-map)
(cd ventures/ai-first-markets && npx vitest run && npx tsc --noEmit)   # 60 passed, typecheck clean
# through the bundled Lambda handler: /, /ideas/, /reports/path-to-100k/, /market-map/ 200; /nope 404 page
SITE_DIR=ventures/ai-first-markets/aws/out SITE_PAGE=/reports/path-to-100k/ \
  node platform/aws/stacks/saas-starter/runtime/test/site-browser.check.mjs   # Chromium: stranger refused; owner lands on "Path to $100k ARR"
```
