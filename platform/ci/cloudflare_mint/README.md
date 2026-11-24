# cloudflare_mint: one-hour Cloudflare tokens for CI

Owner, 2026-11-24: Cloudflare key management was "click ops" and "very poor".
The goal is no long-lived, broad Cloudflare credential in any deploy job and
no manual rotation.

**How it works.** One secret, `CLOUDFLARE_MINTER_TOKEN`, can do one thing:
create API tokens. A job that talks to Cloudflare runs this action, which
creates a token with only that job's permissions (a *profile* in
[`profiles.json`](profiles.json)), on only this account or zone, expiring in
15 to 75 minutes. The action's `post:` step deletes the token when the job ends,
pass or fail, and sweeps any expired `ci-mint:` token an earlier, killed job
left behind.

```yaml
- name: Short-lived Cloudflare token
  uses: ./platform/ci/cloudflare_mint        # from another repo: Duncan-Haywood/oss-monorepo/platform/ci/cloudflare_mint@<sha>
  with:
    minter_token: ${{ secrets.CLOUDFLARE_MINTER_TOKEN }}
    account_id: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
    profile: edge-deploy
# later steps see CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (export_env: "false" to keep it to steps.<id>.outputs.token)
```

Files: `mint.mjs` (library and CLI), `main.mjs` / `post.mjs` (action entry
points), `mint.test.mjs` (`node --test platform/ci/cloudflare_mint/mint.test.mjs`,
every API call mocked). No npm dependencies.

## What this fixes, and what it does not

The minter is still a long-lived secret, and the token it can create can hold
any permission its owner holds. **A leaked minter is as bad as a leaked admin
token.** What changes:

- One secret per repository instead of fifteen secret names across two
  repositories, one of which accepted the Global API Key.
- The minter is read only by the mint step, in a GitHub environment limited to
  `main`. `npm ci`, wrangler, build scripts and every later step see only a
  narrow token that dies within the hour. Today they see the broad one.
- Each token is named `ci-mint:<repo>:<profile>:<run>.<attempt>.<job>`, so
  Cloudflare's audit log ties every API call to a workflow run.
- Rotating means editing one secret. Job tokens never need rotating.

## Alias map (2026-11-24)

| Repository | Workflow / job | Aliases read | Calls | Profile |
|---|---|---|---|---|
| oss | `portfolio-pages.yml` gate, deploy-cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLAREAPITOKEN`, `CLOUDFLARERESTRICTEDAPIKEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLAREACCOUNTID` | `wrangler deploy` ×2 (site and shard Workers; the custom domain is already attached, there is no `routes` key) | `site-deploy` |
| oss | `edge-deploy.yml` gate, deploy | same five | `wrangler d1 list/create/execute`, `wrangler deploy` | `edge-deploy` |
| oss | `cloudflare-email.yml` | same five | `/zones?name=`, `/zones/{id}/email/routing*` | `email-routing` |
| oss | `site-usage-pull.yml` | `CLOUDFLARE_ANALYTICS_TOKEN`, then the five | GraphQL zone and account analytics, `/zones?name=` | `usage-analytics` |
| oss | `ai-first-markets-deploy.yml` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `opennextjs-cloudflare deploy` (one Worker) | `ai-first-markets-deploy` |
| oss | `real-estate-agent-photo-app-deploy-docs.yml` deploy | same two | `wrangler pages deploy` | `listing-lens-docs-deploy` |
| oss | same, apply-access | same two | `/accounts/{id}/access/{apps,policies,identity_providers,organizations}` | `listing-lens-access` |
| private | `grants-deploy.yml` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY`, `CF_API_TOKEN`, `CLOUDFLARE_TOKEN`, `CF_API_KEY`, `CF_TOKEN`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCOUNT_ID` | `wrangler deploy` (D1, R2, Vectorize, Queues, Workflows, custom domain), `wrangler d1 migrations`, `wrangler secret`, `/zones`, `/workers/subdomain` | `grants-deploy` |
| private | `grants-backup.yml` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `wrangler d1 export`, `wrangler r2 object put/delete`, R2 list API | `grants-backup` |
| private | `grants-set-admins.yml` | the six token names, account id | `wrangler secret put` | `grants-set-admins` |

**The Global API Key.** `grants-deploy.yml`'s "Cloudflare credentials" step
accepts a 37-hex-character value with `CLOUDFLARE_EMAIL`, checks it with
`X-Auth-Email` / `X-Auth-Key` against `/user`, and hands wrangler
`CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`. That is the Global API Key path.
The latest production deploy (run 45339823076, 2026-11-24) did not take it:
the only token secret visible was `CLOUDFLARE_API_KEY`, and the log shows
`CF_AUTH_MODE: token`, so that secret holds a scoped API token under a
misleading name. Whether a Global API Key is saved anywhere else (for example
an unused `CF_API_KEY` in another environment) cannot be seen from here. The
owner steps below remove the code path and every name, then roll the key.

## Profiles

Names are Cloudflare permission groups, looked up at run time; a name that does
not exist stops the job before any token is made, and lists close matches.
`node mint.mjs plan <profile>` prints a policy offline.
`node mint.mjs check` with the minter resolves every name against the live API
and creates nothing: run it once after setup.

- **Workers Scripts Write**: upload Workers, set Worker secrets, workers.dev, Workflows.
- **Account Settings Read**: wrangler reads the account on every command.
- **D1 Write**: list/create/migrate/export databases. **Workers R2 Storage Write**,
  **Vectorize Write**, **Queues Write**: what grants' bindings provision.
- **Pages Write**: `wrangler pages deploy`. **Access: Apps and Policies Write**
  and **Access: Organizations, Identity Providers, and Groups Read**: the docs
  site's Access app and its login domain.
- Zone: **Zone Read** to find a zone by name; **Email Routing Rules Write** and
  **Zone Settings Write** for Email Routing; **Analytics Read** for zone
  analytics; **DNS Write** and **Workers Routes Write** for grants' custom domain.

No profile may contain an API Tokens permission (a test enforces it), so a job
token can never mint.

## Sources and what is not verified

The endpoint paths, request body (`policies`, `expires_on`, `not_before`,
`condition.request_ip`), the `result.value` field and the permission-group
fields (`scopes`, `is_selectable`) come from Cloudflare's SDK, npm `cloudflare`
7.3.0, read on 2026-11-24. developers.cloudflare.com was unreachable from the
session that wrote this, so three things rest on earlier reading and are
checked by the first real run, not assumed: the minter's permission name
("API Tokens Write", dashboard template "Create Additional Tokens"); the exact
names in `profiles.json` (`mint.mjs check` reports any wrong one); and any
upper bound Cloudflare puts on `expires_on` (60 minutes is far inside any limit
seen so far).

## Owner: one-time setup

1. **Cloudflare**: My Profile → API Tokens → Create Token → template
   **Create Additional Tokens** (User → API Tokens → Edit, nothing else). No
   expiry. Copy the value once.
2. **GitHub, oss-monorepo**: Settings → Environments. In `cloudflare` and in
   `usage` (both: deployment branches = `main` only), add secret
   `CLOUDFLARE_MINTER_TOKEN`. Settings → Variables: add `CLOUDFLARE_ACCOUNT_ID`
   (an id, not a secret) and, if missing, `CLOUDFLARE_ZONE_ID` for marisstella.app.
3. **GitHub, private-monorepo**: the same secret in environments `production`
   and `demo` (main only), and the same `CLOUDFLARE_ACCOUNT_ID` variable.
4. Approve the two workflow PRs (they are control-plane and wait for you), then
   run one deploy in each repository and check it is green.
5. **Delete** the old secrets (repository and every environment level):
   oss-monorepo `CLOUDFLARE_API_TOKEN`, `CLOUDFLAREAPITOKEN`,
   `CLOUDFLARERESTRICTEDAPIKEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLAREACCOUNTID`,
   `CLOUDFLARE_ANALYTICS_TOKEN`; private-monorepo `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_API_KEY`, `CF_API_TOKEN`, `CLOUDFLARE_TOKEN`, `CF_API_KEY`,
   `CF_TOKEN`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCOUNT_ID`.
6. **Cloudflare**: on the API Tokens page, delete every old token those
   secrets held (anything not named `ci-mint:…` and not the minter), and
   **roll the Global API Key** (it can be regenerated, not deleted; the old
   value stops working).

Revoking everything in an emergency: delete the minter on the API Tokens page.
Every job token it made expires within the hour anyway.
