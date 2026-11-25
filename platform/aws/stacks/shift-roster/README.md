# stacks/shift-roster: the hosted team hub on the AWS SaaS starter

Task `aws-move-products` (`portfolio/work/tasks.yaml`), first product moved: it is the
only one of the five with a paid path (`ventures/shift-roster-builder/checkout.mjs`), and a
hosted hub is the subscription a small team would pay for. Nothing here is applied: there is
no AWS account yet.

## What moves, and what does not

Shift Roster Builder's team hub ran in two self-hosted forms, both on the *user's* machines:
`server.mjs` (Node, one JSON file) and `hub-worker.mjs` (the user's own Cloudflare account,
one Durable Object). Neither ran on our accounts, so there is no Worker of ours to retire and
no data of ours to copy. What this stack adds is the **hosted** hub (pivot 2026-11-24: hosted
by default), and a way for a self-hosted team to move into it:

| Self-hosted | Hosted (this stack) |
|---|---|
| one team per deploy | one row per team in `roster_hub.hub_teams` (Postgres on the starter) |
| `ADMIN_KEY`, `TEAM_TOKEN` env secrets | per-team random keys (32 bytes), only their SHA-256 stored; rotate from the console |
| state in a JSON file / one Durable Object | `state jsonb`, written under `SELECT ... FOR UPDATE` (a Durable Object's one-at-a-time, kept) |
| `TIMEZONE`, `PAY_RULES`, ... in env | the same names per team in `settings jsonb` (an allowlist) |
| `NOTIFY_WEBHOOK_URL`, `TEAM_WEBHOOK_URL` | off: no internet route (no NAT), and a user-typed URL fetched from our network is an SSRF risk |
| — | `/start`: managers sign in (Cognito hosted sign-in, code + PKCE) and create, list, rotate and delete hubs |

The Worker and the Node server are unchanged and keep working; the "Deploy to Cloudflare"
path stays for anyone who asks to self-host. Data migration is per team, by the team:
`ventures/shift-roster-builder/aws/migrate-hub.mjs` reads the old hub's new
`/admin/export.json` (admin key) and creates a hosted hub with that state.

## Pieces

| File | What |
|---|---|
| `main.tf` | one `modules/app-service` call over saas-starter's `platform` output, renamed to this stack's IAM prefix and boundary |
| `ventures/shift-roster-builder/aws/app.mjs` | the handler: `hub.mjs` unchanged, plus team lookup, row lock, console, `/api/teams` |
| `ventures/shift-roster-builder/aws/migrations/001_hub_teams.sql` | the table, applied as `app_roster_hub` on every deploy |
| `ventures/shift-roster-builder/aws/build.mjs` | starter bundle + `calc.mjs`/`bnp.mjs` copied beside it (the admin page builds the roster in the browser) |
| `ventures/shift-roster-builder/aws/local.mjs` | the app in memory with a fake authorizer, for tests and local runs |

Conventions: IAM and Lambda names start with `shift-roster-` (function
`shift-roster-roster-hub`); every role carries `permissions_boundary_arn`; state key
`shift-roster/terraform.tfstate` in the apps account's bucket, beside saas-starter's, which
this stack reads (`saas_starter_state_key`). The database is `roster_hub`, made by
saas-starter's db-admin Lambda, which this stack's apply role must be allowed to invoke.

## Apply order

1. saas-starter applied (its `platform` output exists).
2. `npm ci` in `platform/aws/stacks/saas-starter/runtime`, then
   `node ventures/shift-roster-builder/aws/build.mjs`.
3. `tofu init -backend-config=backend.hcl && tofu apply` with `deploy_role_arn`,
   `state_bucket`, `permissions_boundary_arn`, `allowed_account_ids`. Outputs `api_endpoint`
   and `auth` (public values).
4. Cutover (`docs/runbooks/aws-cutover.md`): a regional ACM certificate for
   `hub.marisstella.app`, `custom_domain` set, the DNS stack's `extra_alias_records` from
   `api_domain_target` (the name is reserved in `stacks/dns/planned.json`, owner
   `shift-roster`). Until then the console's sign-in cannot complete: Cognito only returns to
   the registered `https://hub.marisstella.app/auth/callback`.
5. Paid: once the owner's Paddle product exists, checkout passes
   `customData: { user_sub, product: "roster_hub" }`; `free_teams` (default 1) is how many hubs
   an account gets without a plan. Until then the gate is dark: the second hub answers 402.

## Cost

Per product on the starter: Lambda and HTTP API at early volume are cents (reserved
concurrency 10 caps both spend and Postgres connections); Cognito Lite is free to 10,000
monthly active users; the database and network are the starter's fixed ~$32/month, shared.
No NAT is needed (no outbound calls).

## Checks run here (2026-11-25)

```sh
tofu -chdir=platform/aws/stacks/shift-roster init -backend=false && tofu validate && tofu test   # 5 passed
tofu -chdir=platform/aws/modules/app-service test                                                 # 8 passed
(cd ventures/shift-roster-builder && node --test aws/app.test.mjs)                               # 7 passed
PG_SUPERUSER_URL=postgres://... node --test ventures/shift-roster-builder/aws/pg.test.mjs        # 1 passed (Postgres 16)
(cd ventures && node shift-roster-builder/aws/console-browser.check.mjs)                         # Chromium, all ok
python3 platform/ci/run_venture_tests.py shift-roster-builder                                    # 794 tests, 0 failed
```
