# stacks/listing-lens: Listing Lens private docs on the AWS SaaS starter

Task `aws-move-products`, second product. `ventures/real-estate-agent-photo-app/docs-site` is a
Next.js static export, today on Cloudflare Pages (project `listing-lens-docs`) behind a
Cloudflare Access policy that lets one address in for 24 hours at a time
(`docs-site/infra/access-policy.json`). Nothing here is applied: there is no AWS account yet.

## What replaces what

| Cloudflare | AWS (this stack) |
|---|---|
| Pages serves `out/` | the starter's site app (`saas-starter/runtime/src/site.mjs`) serves `out/` from the product Lambda |
| Access: allow one address, deny everyone else | `allowed_emails` (a repository variable, not committed); Cognito pool with no self sign-up and MFA on; a 12-hour signed session cookie |
| `_headers` (noindex, DENY framing, nosniff) | `ROBOTS = "noindex"` plus the site app's default headers (the `_headers` file itself is not served) |
| `listing-lens-docs.pages.dev` | `listing-docs.marisstella.app` (reserved in `stacks/dns/planned.json`, owner `listing-lens`) |

Static files only: there is no D1, KV or R2 data to migrate. The product database holds one
row, the gate's HMAC key.

Found while moving it: every page under `/docs/<slug>/` was built as "Page not found" (Next 16
passes `params` as a Promise and the page read `params.slug`). Fixed in
`docs-site/src/app/docs/[slug]/page.tsx`, so the Cloudflare site gets the fix on its next
deploy too.

## Apply and cut over

1. saas-starter applied. Build: `npm ci && npm run build` in `docs-site/`, then in
   `saas-starter/runtime`: `npm ci && node build.mjs site listing_docs ../../../../../ventures/real-estate-agent-photo-app/docs-site/out`.
2. `tofu apply` with `deploy_role_arn`, `state_bucket`, `permissions_boundary_arn`,
   `allowed_account_ids` and `allowed_emails`.
3. Sign-in accounts (one CLI line per address; Cognito emails a temporary password, and the first
   sign-in sets a password and a TOTP app):
   `aws cognito-idp admin-create-user --user-pool-id <auth.user_pool_id> --username <address> --user-attributes Name=email,Value=<address> Name=email_verified,Value=true`.
4. A regional ACM certificate for `listing-docs.marisstella.app`, then `certificate_arn`, then
   the DNS stack's `extra_alias_records` from `api_domain_target`. Sign-in only returns to
   `https://listing-docs.marisstella.app/auth/login`, so the gate works from this step on.
5. Check: signed out, `/docs/strategy/` redirects to `/auth/login`; signed in, it shows the page.
6. Follow-up PR, after cutover: delete `docs-site/wrangler.toml`, `docs-site/infra/access-policy.json`,
   `.github/workflows/priv-real-estate-agent-photo-app-deploy-docs.yml`, the Pages project and
   its Access application. Not in this PR: the Worker side keeps working until then.

## Cost

No fixed cost of its own beyond the starter's shared ~$32/month: a handful of Lambda and HTTP
API requests a month for one reader, Cognito Lite free tier.

## Checks run here (2026-11-25)

```sh
tofu -chdir=platform/aws/stacks/listing-lens test               # 5 passed (mocks)
tofu -chdir=platform/aws/modules/app-service test               # 9 passed
node --test platform/aws/stacks/saas-starter/runtime/test/*.test.mjs   # 15 passed with PG_SUPERUSER_URL (Postgres 16)
SITE_DIR=ventures/real-estate-agent-photo-app/docs-site/out SITE_PAGE=/docs/strategy/ \
  node platform/aws/stacks/saas-starter/runtime/test/site-browser.check.mjs   # Chromium: stranger refused, owner in
(cd ventures/real-estate-agent-photo-app/docs-site && npm run build)          # 0, doc pages render their content
```
