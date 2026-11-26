# Grant Autopilot on AWS (the SaaS starter)

Owner decision, 2026-11-24: everything moves to AWS, security first, OpenTofu, Paddle stays the
merchant of record. Grant Autopilot is the first product on the AWS SaaS starter
(`Duncan-Haywood/oss-monorepo`, `platform/aws/stacks/saas-starter`, pinned at commit
`d59d05bb052dbe82e1bd682e7c02c6fc0a9be424`). **Nothing is applied yet and no AWS account exists.**
The Cloudflare Worker stays the production path until cutover; both builds come from the same
code, and the Worker build is unchanged by this port.

## How it runs

```
browser ─► API Gateway (HTTP API, no JWT authorizer) ─► Lambda saas-starter-grants (VPC, arm64)
             starter runtime: API Gateway event ⇄ Request/Response, env.pg, env.BUCKET, env.secret()
             src/worker/aws/lambda-app.ts: SPA files from the bundle, everything else → the same
             Hono app as the Worker (createFetchHandler(createApp()))
EventBridge Scheduler ─► same Lambda: daily + half-hourly crons (handleScheduled, unchanged),
                         every minute: drain the JOBS table, apply Paddle entitlements,
                         embed chunks that have no vector yet
RDS Postgres 16 (database `grants`, IAM-only role `app_grants`) · S3 bucket (orgs/{orgId}/ keys)
Paddle ─► payments account (infra/aws/payments, this repo) ─► SQS ─► platform.entitlements
```

## Port map (every binding in wrangler.jsonc)

| Workers | AWS | Code |
|---|---|---|
| `fetch` (Hono app) | starter app module, same handler | `aws/lambda-app.ts` |
| static assets (`assets`, `_headers`, `_redirects`, SPA fallback) | files in the bundle, served by the Lambda with the same `_headers`/`_redirects` | `aws/static-assets.ts` |
| D1 `DB` (Drizzle `sqlite-core` schema) | RDS Postgres behind a D1-shaped binding; SQL rewritten per statement | `aws/pg-d1.ts`, `aws/sql-dialect.ts` |
| D1 migrations | `migrations-pg/`, generated from `migrations/` | `aws/ddl.ts`, `scripts/aws/gen-pg-migrations.ts` |
| R2 `FILES` | the product's S3 bucket via the starter's R2 shim; keys outside `orgs/{orgId}/`, `catalog/`, `ops/` are refused | `aws/s3-files.ts` |
| Vectorize `VECTORS` (namespace = orgId) | `aws_vectors` table, namespace = orgId on every statement, exact cosine; missing vectors re-embedded by the job tick | `aws/pg-vector-store.ts`, `aws/reembed.ts` |
| Queue `JOBS` + consumer + DLQ | `aws_jobs` table, drained every minute by the Worker's own consumer; 3 retries then `dead_at` | `aws/pg-queue.ts` |
| Workflow `APPLICATION_PIPELINE` | queued: the drain runs `runPipelineInline`; events take the existing inline path | `aws/queued-pipeline.ts` |
| Cron triggers | EventBridge Scheduler (UTC), same `handleScheduled` | `aws/schedules.ts` |
| Workers AI `AI` (bge-m3, toMarkdown, Whisper) | the same models over Cloudflare's REST API (keeps stored embeddings valid) | `aws/workers-ai-rest.ts` |
| Rate limiting bindings | the app's in-memory fallback limiter (per container) | unchanged |
| `EMAIL` (Cloudflare Email) | SES (`EMAIL_PROVIDER=ses`, PR #33) | unchanged |
| Claude (`LLM_PROVIDER`) | Claude Platform on AWS through `stacks/llm` (PR #33), model stays `claude-haiku-5-5` | unchanged |
| Worker secrets | one JSON secret `grants/app` in Secrets Manager | `aws/env.ts` |
| `/api/billing/webhook` | Paddle → payments sub-stack → entitlements → sync | `services/billing/entitlement-sync.ts` |
| `cf-connecting-ip` | set from the address API Gateway appends to X-Forwarded-For (a client-sent header is dropped) | `aws/lambda-app.ts` |

## Data (D1 → Postgres)

The Drizzle schema and every query stay as they are. The Postgres schema keeps D1's storage model
(integers → `bigint` epoch-ms/cents/0-1 booleans, `real` → `double precision`, JSON in `text`), so a
row means the same on both and the data load needs no conversion. Per statement, `sql-dialect.ts`
turns `?` into `$n`, `like` into `ilike` (SQLite LIKE ignores ASCII case), unqualifies
`on conflict` targets and rewrites the one `json_extract(...) = 1` form grants uses. `raw()` asks
Postgres for array rows, so joins that select two columns with the same name keep both (the
starter's own `env.DB` loses one). Foreign keys are `DEFERRABLE INITIALLY IMMEDIATE`: the app sees
normal checks; the one-off load defers them to COMMIT.

Tenant safety is unchanged: the same services issue the same `org_id`-filtered queries; the vector
store filters every statement by namespace = orgId; files are refused outside `orgs/{orgId}/`
(plus the public `catalog/` and the `ops/` sentinel). Each product has its own database and role
(`app_grants`), so other products cannot read grants data even with a bug.

After `pnpm db:generate` changes `migrations/`, run `pnpm exec tsx scripts/aws/gen-pg-migrations.ts`
and commit `migrations-pg/` (a unit test fails while it is stale). The Lambda applies new files
on deploy (the module's `__migrate` invocation).

## Billing (Paddle stays merchant of record)

Paddle sends webhooks to the payments account's receiver (`infra/aws/payments`, HMAC checked
there with the secret that lives only in that account), which forwards them to the apps
account's queue; the starter's consumer writes `platform.entitlements` keyed by
`custom_data.{product, user_sub}`. Grants bills orgs and binds an org only through its own signed
one-time checkout token, so on AWS a checkout carries that token as `user_sub` too
(`BILLING_ENTITLEMENT_PRODUCT=grants`). Every minute the sync turns changed rows back into Paddle
subscription events and runs them through the same `applyBillingEvent` as the Worker's webhook:
token or existing-subscription binding only (a row naming an org directly is ignored, see
`test/unit/aws-postgres.test.ts`), plan from the billed price only, out-of-order protection,
idempotency, audit log. With no webhook secret the in-app webhook route refuses everything.
Not carried by `platform.entitlements`: period start and a scheduled cancellation (display only;
the cancellation still arrives as `canceled` when it takes effect).

## Infrastructure (OpenTofu, nothing applied)

| Root | Account | What |
|---|---|---|
| `apps/grants/infra/aws` | apps | one `app-service` module call (git ref), the `grants/app` secret container, SES send on one identity |
| `infra/aws/payments` | payments | the Paddle receiver (`app-paddle-webhook`, git ref); only this repository applies it |

Both have `tests/*.tftest.hcl` with every provider and the sibling stacks' state mocked. CI
(`.github/workflows/grants-aws.yml`) runs `tofu fmt -check`, `init -backend=false`, `validate`,
`test` on both, the Postgres integration tests, the bundle build and the smoke test. Apply order
after the starter's own (oss-monorepo `platform/aws/README.md`, `docs/runbooks/aws-cutover.md`):
saas-starter (apps) → `infra/aws/payments` (payments) → `apps/grants/infra/aws` (apps).

Cost added by grants (us-east-1 list prices, check the calculator before apply): the starter's
NAT gateway (~$33/month + data) is required, because grants calls Claude on AWS, Workers AI,
Paddle, Grants.gov and funders' websites; Lambda/API Gateway/S3/Scheduler are cents at current
volume (the per-minute tick is ~43k short invocations a month, inside the free tier).

## What the owner must do (secret values and IDs; no code)

1. Before the first apply, in the oss-monorepo starter stack: `enable_nat = true`; and a CI role
   in the apps account for this repository limited to IAM names `saas-starter-grants*` (like the
   payments role, from `stacks/github-oidc`). Repository variables for the apply workflow:
   account ids, role ARNs, the state bucket (not secrets).
2. After `apps/grants/infra/aws` applies, put the app secret once (apps account; values from the
   Worker's secrets, never in git):
   ```sh
   aws secretsmanager put-secret-value --secret-id grants/app --secret-string file://grants-app.json
   ```
   `grants-app.json` is a JSON object with these keys (those you use): `AUTH_SECRET`,
   `INTERNAL_API_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SIMPLER_GRANTS_API_KEY`,
   `BILLING_API_KEY` (Paddle API key), `TURNSTILE_SECRET_KEY`, `SLACK_SIGNING_SECRET`,
   `INTEGRATIONS_KEY`, `PLATFORM_ADMIN_EMAILS`, `CLOUDFLARE_AI_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN`
   (a token with only *Workers AI: Read/Edit*), `RESEND_API_KEY` only while marketing mail still
   uses Resend. **`AUTH_SECRET` must be the Worker's value**, or every session and pending checkout
   token breaks at cutover. Delete the local file afterwards.
3. Paddle (dashboard): in tofu set `billing_price_ids` to the same price ids as the Worker's
   `BILLING_PRICE_IDS` (public values). After `infra/aws/payments` applies: Developer tools →
   Notifications → new destination = output `webhook_url`, events `subscription.*`; put its secret
   key with `aws secretsmanager put-secret-value --secret-id paddle/notification-secret` in the
   payments account. Keep the Worker's destination until cutover is done.
4. Google OAuth: add `https://<aws host>/grants/api/auth/callback/google` as a redirect URI while
   both run.
5. Payments CI (oss-monorepo `stacks/github-oidc`, PR #18768, not merged yet): create the GitHub
   environment `aws-prod` in this repository, limited to `main`; the apply role
   `gha-private-monorepo-payments-apply` trusts only that environment, the plan role only
   `pull_request`. State: bucket `<payments-account-id>-tofu-state-us-east-1`, key
   `payments/terraform.tfstate`; pass `permissions_boundary_arn` =
   `arn:aws:iam::<payments-account-id>:policy/workload-boundary`.
   **Open conflict, decide before the first payments apply:** that apply role may manage IAM only
   on `payments-*` names, but the starter names the receiver role
   `saas-starter-payments-paddle-webhook` and the apps queue policy allows exactly that name
   (`payments_sender_role_name`). One of the two public-repo pieces has to change (the starter
   says change both names or neither); this repository then follows by setting the module's `role_name`.
6. DNS at cutover (step 7 below).

## Cutover (run both, then switch)

1. **Deploy alongside.** Apply the stacks with `app_url` = a separate host (e.g.
   `https://grants-aws.marisstella.app`), `billing_on_aws = false`. The Worker keeps serving
   `marisstella.app/grants`.
2. **Smoke on AWS.** Health (`/grants/api/health`), sign-up/sign-in, an org, a document upload,
   a search, an application draft, a submission package download. Watch the Lambda logs for
   `rate_limit`, `pipeline.aws_job_failed`, SQL errors, and the JOBS table (`select count(*) from
   aws_jobs where dead_at is not null`).
3. **Pick a quiet window** and block writes on the Worker (Cloudflare → Security → WAF custom
   rule: path starts with `/grants/api/`, method not GET/HEAD → Block). Reads keep working.
4. **Copy data.** RDS is private and IAM-only and the starter has no bastion, so the load runs
   inside the Lambda, started by a direct invocation that API Gateway cannot produce:
   ```sh
   pnpm exec wrangler d1 export grant-autopilot --remote --no-schema --output d1.sql
   pnpm exec tsx scripts/aws/d1-to-postgres.ts d1.sql > load.sql   # one transaction; row counts checked before COMMIT
   aws s3 cp load.sql s3://<bucket output>/ops/cutover/load.sql
   aws lambda invoke --function-name saas-starter-grants --cli-binary-format raw-in-base64-out \
     --payload '{"__scheduled":"grants-load:ops/cutover/load.sql"}' out.json   # deletes the object when done
   rclone sync r2:grant-autopilot-files s3:<bucket output> --checksum   # R2's S3 API → the product bucket
   rm d1.sql load.sql out.json
   ```
   The target must be empty (a repeat load fails and changes nothing). Vectors: Vectorize has no
   export; every job tick embeds up to 200 chunks that have no vector yet, into their own org's
   namespace (`aws/reembed.ts`), so search is complete again within minutes for typical orgs.
5. **Turn billing on:** `billing_on_aws = true`, apply. The first sync applies every entitlement
   row since the payments stack went live.
6. **Smoke again on the AWS host** with real accounts (a test sign-in, the org dashboard).
7. **Switch DNS** for the grants path/host to the API Gateway custom domain (`api_domain_target`),
   set `app_url` to the production origin, apply, remove the WAF rule.
   **Rollback:** point DNS back and remove the WAF rule; the Worker and D1 are untouched (writes
   made on AWS after the switch would need copying back, so decide within the window).
8. **Afterwards:** remove the Worker's Paddle destination, then (after a week clean) the Worker,
   D1, R2, Vectorize and queues.

## Verify locally

```sh
cd apps/grants
pnpm typecheck && pnpm test:unit && pnpm test:worker
# Postgres adapters against a real Postgres 16 (skipped without these variables)
GRANTS_PG_URL=postgres://postgres@localhost:5432/postgres PG_MODULE_DIR=<starter>/runtime \
  STARTER_PLATFORM_SQL=<starter>/runtime/sql/001_platform.sql \
  pnpm exec vitest run --config vitest.unit.config.ts test/unit/aws-postgres.test.ts
STARTER_RUNTIME=<starter>/runtime scripts/aws/build-lambda.sh
STARTER_RUNTIME=<starter>/runtime PG_SUPERUSER_URL=postgres://postgres@localhost:5432/postgres \
  node scripts/aws/smoke-lambda.mjs
cd infra/aws && tofu init -backend=false && tofu validate && tofu test
```

## Known gaps

- Not applied or planned against real AWS; `tofu validate`/`test` run in CI (the session that
  wrote this could not run the tofu binary).
- Auth stays Better Auth (cookies); the starter's Cognito pool is created but unused and no route
  uses its JWT authorizer. Moving users to Cognito is a separate decision.
- Pipeline jobs are not retried on failure (a retry could add a second draft version); the
  application can be regenerated. Cloudflare Workflows retried individual steps.
- Rate limits are per Lambda container (in-memory) instead of global; API Gateway throttling
  (`throttle_rate`/`throttle_burst`) is the global guard. A Postgres-backed limiter is the upgrade.
- Vector search is exact cosine in the Lambda over one org's rows; pgvector is the upgrade when an
  org grows past a few thousand chunks.
- Workers AI stays on Cloudflare (REST) until a Bedrock embedding move is evaluated (re-embed + evals).
- Postgres sorts NULLs last in ascending order (SQLite: first); no grants screen depends on it today.
