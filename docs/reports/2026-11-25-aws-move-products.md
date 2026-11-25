---
kind: brief
topics: [everything-as-code, hosting]
date: 2026-11-25
---
# aws-move-products: state for the next session (2026-11-25)

Four public-repository products have AWS stacks on the SaaS starter, one PR each, ordered by
paid potential. The fifth, local-site-studio's Convex backend, is an exception (below). Grant
Autopilot is moved by a session in the private repository. Nothing is applied: there is no AWS
account yet.

| # | Product | Stack | Was | Now (built, tested, not applied) | PR |
|---|---|---|---|---|---|
| 1 | shift-roster-builder | `stacks/shift-roster` | self-hosted only (Node / the user's own Cloudflare Worker + Durable Object) | hosted multi-team hub: `aws/app.mjs`, Postgres row locks, sign-in console `/start`, paid gate dark (`FREE_TEAMS`), `aws/migrate-hub.mjs` from `/admin/export.json` | #18787 |
| 2 | real-estate-agent-photo-app docs | `stacks/listing-lens` | Cloudflare Pages + Access | starter site app (`runtime/src/site.mjs`) behind its sign-in gate; fixed every doc page building as "not found" | #18792 |
| 3 | retail-pilot-intel docs | `stacks/retail-pilot-intel` | static-assets Worker, client passcode | site app; optional server gate (`allowed_emails`) | #18794 |
| 4 | ai-first-markets | `stacks/ai-first-markets` | OpenNext Worker with its own Google sign-in | `aws/build.mjs` static export + site app gate; no secrets | #18795 |
| 5 | local-site-studio (Convex) | none | never deployed | exception, below | this PR |

None had D1, KV or R2 data of ours: the docs and markets sites are static, and the roster hubs
live on their users' own machines (moved per team by `migrate-hub.mjs`).

## New shared pieces (other products reuse them)

- `runtime/src/site.mjs` + `build.mjs site <name> <dir>`: a built static site served by the
  product Lambda; with `GATE_EMAILS`, a Cognito sign-in gate whose ID token is checked by API
  Gateway's JWT authorizer (no outbound call, no NAT) and a 12 h HMAC cookie keyed by a row in
  the product's database (no secret in state). Tests: `runtime/test/site.test.mjs`,
  `runtime/test/site-browser.check.mjs` (Chromium).
- `modules/app-service`: `COGNITO_DOMAIN`/`COGNITO_WEB_CLIENT_ID` reach every app (`env.AUTH`)
  for its own sign-in page; `auth.self_sign_up` and `auth.mfa`.
- Product stack pattern: `terraform_remote_state` of saas-starter's `platform` output, renamed
  with `name_prefix = <stack>` and the stack's `permissions_boundary_arn`; state key
  `<stack>/terraform.tfstate`; tests override the remote state with `override_data`. Each
  custom-domain name is reserved in `stacks/dns/planned.json` (`hub`, `listing-docs`,
  `pilot-docs`, `markets`).

## Exception: local-site-studio's Convex backend (not moved, on purpose)

- **Nothing runs to move.** No Convex deployment exists: `.env.example` leaves
  `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` empty, the dashboard shows a "persistence"
  banner until they are set, and no workflow deploys the app or Convex. The app targets Vercel
  (`vercel.json`), not Workers, so it holds no Cloudflare resources either.
- **The port is a launch, not a move.** `src/lib/db.ts` (4,354 lines, 89 exports) switches
  between a local SQLite store and Convex (12 tables, `convex/schema.ts`; about 9,400 lines in
  `convex/` with tests). On the starter it would become a third driver over `env.DB`/`env.pg`,
  plus the Next.js server (Stripe checkout, Vapi voice webhooks, Resend, three daily crons in
  `vercel.json`) on Lambda. That is several sessions of work for a product
  `portfolio/flagships.yaml` passed over ("real integrations but bloated, its core site
  generator is thin").
- **When to do it:** when local-site-studio is chosen to launch. Then build it on the starter
  directly (Postgres driver for `db.ts`, `schedules` for the three crons, payments through the
  starter's Paddle path rather than Stripe keys) and drop the Convex path instead of
  deploying it first.

## Next steps

1. Merge order: #18787, #18792, #18794, #18795 (each stacked on the one before).
2. After the account exists and each stack is applied and cut over: the follow-up PRs that
   remove `wrangler.*`, the Pages/Worker deploy workflows and the replaced auth code (listed in
   each stack's README). Not before.
3. Not done here: CI workflows to plan/apply these stacks (copy `saas-starter/ci/saas-starter.yml`),
   and ACM certificates for the four names (a sibling edge/DNS stack's job).
4. Per the aws-org-baseline session (2026-11-25): each of `shift-roster`, `listing-lens`,
   `retail-pilot-intel` and `ai-first-markets` needs an entry in `stacks/github-oidc`'s `stacks`
   variable (PR #18768, apps account) to get its `gha-oss-monorepo-<stack>-plan/-apply` roles;
   the apply role may only create IAM names `<stack>-*` carrying `workload-boundary`, which
   these stacks already do. The apply role also needs `lambda:InvokeFunction` on saas-starter's
   db-admin (each product's `ensure_db`). `priv-aws-plan`'s check compares each
   `.terraform.lock.hcl` with the registry: the four were copied from saas-starter's (aws
   6.73.0, archive 2.8.1); commit whatever that job prints. Nothing here makes a public bucket
   or S3 website endpoint, which PR #18780's resource control policies would refuse.
