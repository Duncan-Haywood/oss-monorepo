# Grant Autopilot

Grant Autopilot finds grant opportunities, matches them to a nonprofit, drafts applications grounded only
in the organization's own documents and confirmed facts, routes each draft to the right level of human
review, submits it and tracks follow-ups. Multi-tenant from day one.

It is one Cloudflare Worker (Hono API + React SPA + queue consumer + crons + a Workflow) built with Vite
and `@cloudflare/vite-plugin`, using D1, R2, Vectorize, Queues, Workflows, Workers AI and rate limiting,
with Claude (`claude-haiku-5-5`, set by `LLM_MODEL`) for extraction, matching and drafting.

## Quickstart

```sh
pnpm install                     # from the repo root (Node 22, pnpm 10)
cd apps/grants

# Offline demo: no API keys, no network (fake LLM/embeddings/email/web, jobs run inline)
scripts/demo.sh                  # writes .dev.vars if absent, prepares local D1, runs pnpm dev
# open http://localhost:5173, sign up, then POST /api/demo/seed for the fictional sample org

# Real development against Claude
cp .dev.vars.example .dev.vars   # set ANTHROPIC_API_KEY, AUTH_SECRET, INTERNAL_API_TOKEN
scripts/local-db.sh              # apply the current schema to local D1 (idempotent)
pnpm dev
```

## Commands (from `apps/grants`)

| Command                                  | What it does                                                   |
| ---------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                               | Vite dev server with the Worker in workerd (local D1/R2/Queues) |
| `pnpm build`                             | production build (`dist/client` + `dist/grant_autopilot`)      |
| `pnpm typecheck`                         | TypeScript, strict                                             |
| `pnpm test:unit` / `pnpm test:worker`    | Node unit tests / workerd integration tests (fake externals)   |
| `pnpm test:e2e` (or `scripts/e2e-run.sh`) | Playwright demo flow, offline                                 |
| `pnpm exec tsx evals/run.ts --fake`      | eval harness smoke test (drop `--fake` for real Claude)        |
| `pnpm exec biome check --write <files>`  | lint + format                                                  |
| `pnpm db:generate`                       | new D1 migration from the Drizzle schema (commit it)           |
| `pnpm db:migrate:local`                  | apply migrations to local D1                                   |
| `scripts/local-db.sh [--reset]`          | current schema to local D1 without migrations                  |
| `scripts/demo.sh`                        | local offline demo                                             |
| `node scripts/provision.mjs [--env demo] [--dry-run]` | Vectorize index + metadata indexes, queues (idempotent) |

Deploys happen in CI only: pull requests run `grants-ci`, merges to `main` run `grants-deploy`
(production); the demo deployment is a manual `grants-deploy` run with `environment=demo`.

## AWS (SaaS starter): cutover and owner steps

Grant Autopilot also builds for AWS Lambda through the AWS SaaS starter (RDS Postgres, S3,
EventBridge, Paddle webhooks through the payments sub-stack). Full detail: [docs/AWS.md](docs/AWS.md).
Nothing is applied yet; the Worker stays production until the switch.

Owner (secret values and IDs only):
1. Starter stack: `enable_nat = true`; a CI role in the apps account for this repo (`saas-starter-grants*`).
2. After apply: `aws secretsmanager put-secret-value --secret-id grants/app` with the JSON of grants'
   secrets (keys listed in docs/AWS.md; `AUTH_SECRET` must equal the Worker's).
3. Paddle: same price ids in `billing_price_ids`; a notification destination at the payments stack's
   `webhook_url` (events `subscription.*`), its key in `paddle/notification-secret` (payments account).
4. Google OAuth redirect URI for the AWS host; DNS at the end.

Cutover (run both, then switch): deploy on a separate host with `billing_on_aws = false` → smoke test →
WAF rule blocks writes on the Worker → `wrangler d1 export` → `scripts/aws/d1-to-postgres.ts` → load via
the Lambda's `grants-load:` invocation, `rclone` R2 → S3 (vectors rebuild themselves) → `billing_on_aws = true`
→ smoke again → switch DNS, remove the WAF rule. Rollback = DNS back; D1 and the Worker are untouched.

| Command (AWS) | What |
| --- | --- |
| `pnpm exec tsx scripts/aws/gen-pg-migrations.ts` | regenerate `migrations-pg/` after `pnpm db:generate` |
| `STARTER_RUNTIME=… scripts/aws/build-lambda.sh` | build `dist-aws/app-grants` with the starter's runtime |
| `node scripts/aws/smoke-lambda.mjs` | smoke-test the built bundle against Postgres |
| `cd infra/aws && tofu init -backend=false && tofu validate && tofu test` | product stack, mocked |

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, module ownership, endpoint contract, anti-fabrication design
- [docs/DEPLOY.md](docs/DEPLOY.md): Cloudflare/GitHub setup, pipeline, first deploy, rollback, secrets, local dev
- [docs/AWS.md](docs/AWS.md): the AWS port (Lambda, Postgres, S3, Paddle via the payments sub-stack), cutover, owner steps
- [docs/OPERATIONS.md](docs/OPERATIONS.md): running the service
- [docs/DATA_POLICY.md](docs/DATA_POLICY.md) and [docs/legal/](docs/legal/): data handling and policies
- [docs/PRICING.md](docs/PRICING.md): plans and cost model
- [docs/EVALS.md](docs/EVALS.md) and [docs/PROMPTS.md](docs/PROMPTS.md): LLM quality and prompts
