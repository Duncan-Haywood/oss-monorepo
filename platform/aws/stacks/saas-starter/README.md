# stacks/saas-starter: the AWS platform every paid product runs on

Task `aws-saas-starter` (`portfolio/work/tasks.yaml`), direction `aws-consolidation`
(`docs/reports/2026-11-24-cloud-provider-comparison.md`, §7). Nothing here has been applied:
there is no AWS account yet. Everything is written to be applied by CI once the owner has done
the account steps AWS forces.

## What it is

```
 Paddle (merchant of record, stays external)
   │  POST + Paddle-Signature (HMAC)
   ▼
 payments account ─ saas-starter/payments ──────────────────────────────────────────
   Lambda function URL  → verify HMAC with secret from Secrets Manager (this account)
                        → SendMessage (only this role may)            │
 apps account ─ saas-starter ──────────────────────────────────────── ▼ ───────────
   SQS (CMK) ──► entitlement-consumer (VPC, DB role entitlement_writer) ─► Postgres
                                                                         ▲   (one RDS,
   browser / iOS / Android                                               │   a DB per
     │  Cognito hosted sign-in (code + PKCE, no client secret)           │   product)
     ▼                                                                   │
   HTTP API ── /api/* JWT authorizer ──► product Lambda (VPC, IAM DB auth) ┘
             └ $default public ────────►   fetch(request, env, ctx)  ← the product
                                           env.DB (D1-shaped), env.BUCKET (R2-shaped),
                                           env.user, env.entitlement(), env.push, env.secret()
   EventBridge Scheduler ─► scheduled(controller, env, ctx)   SNS mobile push ◄─ env.push
   Fargate (app-job) for work longer than Lambda allows
```

| Piece | Where | Module |
|---|---|---|
| Private VPC, no internet route by default (optional single NAT, HTTPS only); S3 gateway endpoint; interface endpoints in 1 AZ; flow logs | apps | `modules/app-network` |
| RDS Postgres 16, `db.t4g.micro`, KMS-encrypted, IAM auth, TLS forced, never public; RDS-managed master secret; optional RDS Proxy (IAM end to end); `db-admin` Lambda that creates a database + IAM-only role per product | apps | `modules/app-database` |
| Product: Lambda (arm64, Node 22, in VPC, reserved concurrency), HTTP API with Cognito JWT authorizer, Cognito pool with web + native clients, private S3 bucket, optional SNS push, cron triggers, migrations on deploy | apps | `modules/app-service` (+ `app-auth`, `app-push`) |
| Long jobs on Fargate (`RunTask`, image pinned by digest, read-only root, non-root) | apps | `modules/app-job` |
| Entitlement queue (CMK, DLQ, alarm) writable only by the payments webhook role; consumer | apps | `modules/app-entitlements` |
| Paddle webhook receiver: function URL, HMAC verify, secret container, forwards to the queue | payments | `modules/app-paddle-webhook` |
| Runtime: adapter, D1/R2 shims, Paddle verify, entitlements, push, db-admin, migrations, build | code | `runtime/` |

## Apply order (turnover)

Owner, once (AWS forces these; nothing else needs a console):

1. The foundation steps in `platform/aws/README.md` (org, baseline, spend stacks): management
   account, root MFA, card, IAM Identity Center. `stacks/github-oidc` then gives this stack its own
   CI roles `gha-oss-monorepo-saas-starter-plan` / `-apply` in the **apps** account (limited to IAM
   names `saas-starter-*` and the account's `workload-boundary`), a state bucket per account, and
   a payments-account role that trusts only the private repository.
2. Copy `ci/saas-starter.yml` to `.github/workflows/aws-saas-starter.yml` and set the repository
   variables it lists (account ids, role and boundary ARNs: not secrets). `deploy_role_arn` is the
   role the provider assumes; the apply role must be allowed to assume it (or be it).

Conventions this stack follows (from the foundation stacks): every IAM role and Lambda is named
`saas-starter-*` (payments: `saas-starter-payments-*`); every role carries
`permissions_boundary_arn`; the payments half is a sub-stack that only the private repository
applies.

Then, in order:

| Step | Who | Command / action |
|---|---|---|
| 1. apps stack | CI on merge (`apply` job) | `node runtime/build.mjs platform` then `tofu apply` in `saas-starter/` with `payments_account_id` set. Outputs `entitlement_queue_url`, `entitlement_queue_arn`, `entitlement_queue_kms_key_arn`. |
| 2. payments stack | owner, or the private repository's CI | `tofu apply` in `saas-starter/payments/` with those three outputs as `queue_url`, `queue_arn`, `queue_kms_key_arn`. Outputs `webhook_url`, `secret_name`. |
| 3. Paddle | owner (Paddle dashboard) | Developer tools > Notifications > new destination: URL = `webhook_url`, events `subscription.*`. Copy its secret key. |
| 4. Secret | owner (one CLI line) | `aws secretsmanager put-secret-value --secret-id paddle/notification-secret --secret-string '<key>'` in the payments account. The value never enters this repository. |
| 5. Check | anyone | Paddle's "send test notification" → the consumer log shows `outcome: ignored` (test events carry no `customData`); the DLQ stays empty. |
| 6. Products | CI | add one module call per product (below); merge. |

The role name `saas-starter-payments-paddle-webhook` is the contract between the two stacks
(`payments_sender_role_name` here = `app-paddle-webhook.role_name` there); change both or neither.

## Adding a product (one module call + a handler)

1. Write the app as a Workers-style module and its SQL migrations:

   ```js
   export default {
     async fetch(request, env, ctx) { /* env.DB, env.BUCKET, env.user, env.entitlement(), env.push, env.secret() */ },
     async scheduled(controller, env, ctx) { /* optional cron */ },
   };
   ```

   `examples/hello/app.mjs` is the complete reference (public page, signed-in API, paid gate,
   D1-style queries, device registration, cron).
2. Build: `node runtime/build.mjs product <name> path/to/app.mjs path/to/migrations` → `runtime/dist/app-<name>`.
3. Add to `products.tf`:

   ```hcl
   module "grants" {
     source     = "../modules/app-service"
     name       = "grants"                       # DB name, role app_grants, Paddle customData.product
     source_dir = "${local.build_dir}/app-grants"
     platform   = local.platform
     auth       = { domain_prefix = "grant-autopilot", web_callback_urls = ["https://grants.marisstella.app/auth/callback"] }
     schedules  = { daily = "cron(0 13 * * ? *)" }
     # Claude through stacks/llm (Claude Platform on AWS): role credentials, no API key.
     extra_policy_arns = [data.terraform_remote_state.llm.outputs.invoke_policy_arn]
     environment       = data.terraform_remote_state.llm.outputs.app_environment
   }
   ```

4. Checkout: pass `customData: { user_sub: <Cognito sub>, product: "<name>" }` to Paddle.js
   `Checkout.open`. Paddle copies it onto the subscription, and the consumer keys the
   entitlement on it. Without it an event is logged and ignored.
5. Merge. `tofu apply` runs db-admin (database + role), deploys the function, runs the
   migrations, and prints the API endpoint and the Cognito client ids (public values).

Routes: `ANY /api/{proxy+}` requires a valid Cognito access/ID token (`Authorization: Bearer`);
everything else is public. Web clients use the hosted sign-in with code + PKCE; native apps use
the same pool's native client with a custom-scheme callback (e.g. `grants://auth/callback`) via
the system browser (ASWebAuthenticationSession / Custom Tabs), so neither ships a secret.
`__migrate` and `__scheduled` are top-level invocation fields that API Gateway never produces,
so an HTTP request cannot trigger them.

## Moving a Workers product (Grant Autopilot first)

Grant Autopilot is the first product to move. Its `apps/grants/docs/ARCHITECTURE.md` lives in
the private repository, which this session could not read (access to it was refused here), so
the map below is from the Workers platform's side; the session that ports grants must check
each row against that document and add any binding it uses that is not listed.

| Workers | Starter | Notes |
|---|---|---|
| `export default { fetch }` | same, unchanged | `runtime/src/adapter.mjs` builds a standard `Request` from the API Gateway event and returns the `Response`; `ctx.waitUntil` work is awaited before Lambda freezes. |
| `scheduled()` + cron triggers in `wrangler.toml` | same handler; `schedules` in the module call | EventBridge Scheduler, UTC. Workers cron `0 13 * * *` → `cron(0 13 * * ? *)`. |
| D1 (`env.DB.prepare().bind().first/all/run`, `batch`) | `env.DB`, same calls, on Postgres | `?`/`?N` become `$n`. Port SQLite-only SQL: `INSERT OR REPLACE` → `INSERT … ON CONFLICT … DO UPDATE`; `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`; `datetime('now')` → `now()`; `INTEGER PRIMARY KEY AUTOINCREMENT` → `bigserial`/`identity`; `strftime` → `to_char`; booleans are real booleans; `last_insert_rowid()` → `RETURNING id`. Data: `wrangler d1 export` → load with `psql` (or a script that reads the SQLite dump). |
| R2 (`env.BUCKET.get/put/head/delete/list`) | `env.BUCKET`, same calls, on S3 | Object copy: `rclone` or `aws s3 sync` from R2's S3 API to the product bucket. Presigned URLs: `@aws-sdk/s3-request-presigner`. |
| Workers secrets (`wrangler secret put`) | Secrets Manager + `secret_names`; `await env.secret(name)` | Async, cached per container. |
| `[vars]` | `vars` → `env.VARS` | |
| KV | a Postgres table (or DynamoDB if it is hot) | Not shimmed; usually small config/caches. |
| Queues | SQS + a consumer Lambda | Not in the starter yet; `app-entitlements` is the pattern to copy. |
| Durable Objects | Postgres rows with `SELECT … FOR UPDATE` | Not shimmed. |
| Model calls (Anthropic API key) | `stacks/llm` (Claude Platform on AWS): `extra_policy_arns` + `environment` from its outputs, `enable_nat = true` | Role credentials replace the key. The grants LLM adapter already landed in the private repo (private-monorepo PR 33, per the orchestrating session). |
| Email (Resend / Cloudflare Email Service) | SES (`stacks/email`) | Cognito can send through the same SES identity (`auth.ses_identity_arn`). |
| Auth (whatever grants uses today) | Cognito per product | Users must re-verify by email unless a migration Lambda trigger is added; decide per product. |
| Paddle webhook in the Worker | removed from the app | Paddle points at the payments-account receiver; the app only reads `env.entitlement()`. |
| `*.workers.dev` / custom domain | `custom_domain` (regional ACM cert) + an alias record from the DNS stack (`api_domain_target`) | Run both; move DNS last (principle 5). |

## Cost (us-east-1 on-demand list prices; check the AWS Pricing Calculator before apply)

Fixed, shared by every product:

| Item | Monthly |
|---|---|
| RDS `db.t4g.micro` single-AZ (~$0.016/h) | ~$11.70 |
| 20 GB gp3 (~$0.115/GB) | ~$2.30 |
| 2 interface endpoints × 1 AZ (~$0.01/h each) | ~$14.60 |
| KMS keys (platform, queue, payments; $1 each) | $3.00 |
| Secrets Manager (RDS master, Paddle; $0.40 each) | $0.80 |
| **Total before usage** | **~$32** |

Per product and usage: Cognito Lite free to 10,000 monthly active users; Lambda, HTTP API
(~$1 per million requests), SQS, Scheduler and S3 are pennies at early volume and partly inside
the free tier; CloudWatch Logs ~$0.50/GB ingested (flow logs included). Per-subscriber marginal
cost is cents, so the fixed $32 dominates until there are dozens of subscribers.

Against the 40% margin floor (price ≥ cost ÷ 0.6), the platform clears it from ~$53/month of
revenue, e.g. three $19 subscriptions. Options deliberately off by default, each with its cost:
Multi-AZ (doubles the instance), RDS Proxy (bills a 2-vCPU minimum, ~$22/month, more than the
database: turn on when Lambda concurrency nears `max_connections`, ~80 on micro), Performance
Insights, enhanced monitoring, Container Insights, interface endpoints in more AZs (+$7.30 each),
and `ecr.api`/`ecr.dkr`/`logs` endpoints only when a product uses Fargate.

NAT is off by default: a NAT gateway is ~$33/month before data, endpoints are cheaper for the
two AWS services the apps call, and no internet route is the stronger default. Products that
call Claude through `stacks/llm` (Claude Platform on AWS, an `*.api.aws` HTTPS endpoint) or any
other outside API need `enable_nat = true` (one NAT, HTTPS-only egress rule), which brings the
fixed cost to ~$65/month and the margin-floor break-even to ~$108/month of revenue. The
alternative is Bedrock via a `bedrock-runtime` endpoint (+$7.30/month, `stacks/llm`'s
`enable_bedrock_alternative`). The grants port decides.

## Security properties (tested)

`tofu test` (providers mocked) asserts, per module: no public bucket (all four block flags,
`BucketOwnerEnforced`, TLS-only policy, SSE-KMS); DB encrypted, not public, IAM auth, TLS forced,
deletion protection and final snapshot; app role without wildcard actions or resources and
`rds-db:connect` scoped to `app_<name>`; consumer scoped to `entitlement_writer`; queue writable
only by the payments role, CMK with rotation, DLQ; webhook role reads only its secret and sends
only to the queue; public invoke limited to the function URL; Cognito clients code-flow only, no
secret, no user-existence leaks, 12+ character passwords; Fargate read-only root, non-root, no
public IP, digest-pinned image; scheduler may invoke only its app; bad inputs rejected.

The runtime end-to-end test (`runtime/test/e2e.test.mjs`, real Postgres 16) proves on the data
side: a forged Paddle event never reaches the queue; redeliveries are stored once; an older
event arriving after a newer one does not overwrite it; the app role cannot write
entitlements; an unknown product fails alone to the DLQ; the paid gate opens and closes.

## Verify locally

```sh
cd platform/aws/stacks/saas-starter/runtime && npm ci
PG_SUPERUSER_URL=postgres://postgres:<pw>@localhost:5432/postgres node --test test/*.test.mjs
node build.mjs platform && node build.mjs product hello ../examples/hello/app.mjs ../examples/hello/migrations
cd ../../.. && for d in stacks/saas-starter stacks/saas-starter/payments modules/app-*; do (cd $d && tofu init -backend=false && tofu validate && tofu test); done
checkov -d . --framework terraform --compact --quiet --skip-download
```

Provider lock files carry `h1:` for linux_amd64 and `zh:` hashes for every platform from
HashiCorp's signed SHA256SUMS. If `tofu init` on another platform asks for more, run
`tofu providers lock -platform=darwin_arm64 -platform=linux_amd64`.

## Known gaps

- Not applied or planned against real AWS (no account). First apply may surface API-side
  validation that mocks cannot (e.g. Cognito domain prefix taken).
- Trivy config scan not run here (its release downloads returned 404 through this session's
  proxy); Checkov ran clean. The draft workflow runs Checkov; add Trivy there.
- Queues, KV and Durable Objects are not shimmed (see the migration table).
- Paddle "pass-through hosting" billing for client accounts is the owner's open question (§7).
