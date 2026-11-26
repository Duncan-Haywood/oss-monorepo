# Contributing to Grant Autopilot

Read these first: [CLAUDE.md](../../CLAUDE.md) (the short list of rules),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (stack, endpoint contract, anti-fabrication design),
[docs/MODULES.md](docs/MODULES.md) (who owns what), [docs/GLOSSARY.md](docs/GLOSSARY.md), the
decision records in [docs/adr/](docs/adr/), [docs/PROMPTS.md](docs/PROMPTS.md) (every LLM purpose) and
[docs/OPERATIONS.md](docs/OPERATIONS.md) (rate limits, spend caps, logs, kill switch). Run every command below from `apps/grants` unless it says
otherwise.

## 1. Setup

- Node 22 (`.nvmrc`) and pnpm 10 (`packageManager` in the root `package.json`). Run `pnpm install`
  once at the repo root.
- **Don't add dependencies** or edit `package.json` or the lockfile unless you were asked to.
  Everything the app needs is already installed.
- Secrets: `cp .dev.vars.example .dev.vars` (gitignored) and fill it in. Never commit `.dev.vars`.

## 2. Local development

```bash
pnpm dev                      # Vite + @cloudflare/vite-plugin: SPA and Worker on http://localhost:5173
curl localhost:5173/api/health    # {"ok":true,"env":"development","fake":true|false}
```

- **Database schema.** There are no committed migrations in `migrations/` yet. Until the baseline
  exists, apply the current schema to local D1 the same way the e2e server does:

  ```bash
  pnpm exec drizzle-kit export --sql > .wrangler/schema.sql
  pnpm exec wrangler d1 execute DB --local --file .wrangler/schema.sql
  ```

  Once migrations exist, use `pnpm db:migrate:local`.
- **Real services** need `ANTHROPIC_API_KEY` and `FAKE_EXTERNALS=false`. `wrangler.jsonc` declares
  Workers AI and Vectorize bindings, which have no local simulation, so a real-services dev session needs
  Cloudflare credentials. If you have none, use the offline demo below.
- With `FAKE_EXTERNALS=false` and no `ANTHROPIC_API_KEY`, every LLM call fails with 503
  `llm_not_configured`; there is no silent fake. Real calls go through the spend caps
  (`ORG_MONTHLY_LLM_CAP_USD` and `GLOBAL_DAILY_LLM_CAP_USD`, with defaults in
  `services/guards/llm-budget.ts`) and the rate limiters.
- After changing bindings in `wrangler.jsonc`, run `pnpm cf-typegen` (an integration-pass change). Keep
  `wrangler.test.jsonc` in sync; `test/unit/wrangler-config.test.ts` checks this.

## 3. The offline demo (no keys, no network)

The demo uses fakes for the LLM, embeddings, vectors, email, the web and billing (ADR 0009). Queue jobs
and the pipeline run inline, and billing treats every org as comp.

```bash
E2E_KEEP_STATE=1 bash scripts/e2e-server.sh     # http://localhost:5199, state in .wrangler/e2e
```

The script applies the schema, writes `.dev.vars.e2e` (`FAKE_EXTERNALS=true`, `INLINE_JOBS=true`,
`DEMO_MODE=true`, test-only secrets) and starts Vite with the offline config
(`test/e2e/vite.e2e.config.ts`, which drops the Workers AI and Vectorize bindings). Without
`E2E_KEEP_STATE=1`, every start begins with an empty database. Your own `.dev.vars` and
`.wrangler/state` are never touched.

A demo run:

1. Sign up at `/signup`, then complete `/onboarding`: create the org, add documents (paste
   `test/e2e/fixtures/mission-statement.txt`), add projects, do a short interview, look at the
   autopilot settings.
2. Confirm the proposed facts on **Fact base** (`/knowledge/facts`).
3. Load the sample opportunity catalog and score every org:

   ```bash
   curl -X POST -H "Authorization: Bearer e2e-only-internal-token" \
     http://localhost:5199/api/internal/discovery/run
   ```

   You can also upload `test/e2e/fixtures/rfp.txt` as a private opportunity with **Opportunities → Import a
   grant → Upload an RFP**.
4. Open an opportunity and choose **Draft application**. The cited draft, its flags and the review
   happen in the applications UI. Those pages are still stubs, so use the API (`GET
   /api/orgs/:orgId/applications/:id`, `POST /api/orgs/:orgId/reviews/:id/decision`) until they are
   built.

`POST /api/demo/seed` (a one-call sample org) is planned but not implemented: `routes/demo.ts` is
empty.

## 4. Tests

| What | Command | Notes |
| --- | --- | --- |
| Types | `pnpm typecheck` | strict TS, no `any` |
| Lint and format | `pnpm exec biome check --write <files you touched>` | CI runs `pnpm exec biome ci .` |
| Unit (Node / happy-dom) | `pnpm test:unit` | `src/**/*.test.ts(x)`, `test/unit/**` |
| Worker integration (workerd) | `pnpm test:worker` | `test/worker/**`, `src/worker/**/*.worker.test.ts`; real local D1, R2, Queues, Workflows; fake externals; the schema comes from `drizzle-kit export` |
| One file | `pnpm exec vitest run --config vitest.worker.config.ts test/worker/foo.test.ts` | use `vitest.unit.config.ts` for unit tests. **Prefer targeted runs: the machine has 4 CPUs.** |
| E2E (Playwright) | `pnpm test:e2e` or `scripts/e2e-run.sh test/e2e/02-knowledge.spec.ts -g "confirm"` | offline demo server on :5199 |
| Build | `pnpm build` | |
| Evals, fake | `pnpm exec tsx evals/run.ts --fake` | about 3 s, tests the plumbing and deterministic checks |
| Evals, real Claude | `pnpm exec tsx evals/run.ts --org evtc` with a key, or the manual `grants-llm-evals` GitHub workflow | spends tokens; see docs/EVALS.md |
| Cost benchmark | `pnpm tsx evals/cost-benchmark.ts` | see docs/PRICING.md |

CI (`.github/workflows/grants-ci.yml`) runs biome, typecheck, unit, worker and build on every PR.

What to test: **unit** tests for pure functions (prompt builders, checks, policies, formatting).
**Worker** tests for routes, end to end, including a **cross-tenant test**: a member of org B gets 404
on org A's resources (`setupTenant()` and `api(path, { as: userId })` in `test/worker/helpers.ts`).
Add **e2e** coverage when a user-visible flow changes.

## 5. Adding a backend module or route

1. **Service:** create `src/worker/services/<module>/`. `index.ts` is the public API; other modules
   import only from it. Services are plain functions: `fn(ctx: AppContext, orgId: string, …)`. Put calls
   into other modules in `deps.ts` (one mockable seam per module, normalized with zod), queue handlers in
   `jobs.ts`, and FakeLlm handlers in `fake-llm.ts`.
2. **Router:** create `src/worker/routes/org/<name>.ts` for tenant routes, or `routes/<name>.ts` for
   public ones:

   ```ts
   // OWNER: <module> agent — /api/orgs/:orgId/widgets
   import { zValidator as zv } from "@hono/zod-validator";
   import { Hono } from "hono";
   import { z } from "zod";
   import { requireRole } from "../../middleware/tenant";
   import { createWidget, listWidgets } from "../../services/widgets";
   import type { AppEnv } from "../../types";

   // Throw the ZodError so app.onError renders the standard { error: { code, message } } shape.
   const zValidator = <T extends "json" | "query", S extends z.ZodType>(target: T, schema: S) =>
     zv(target, schema, (r) => { if (!r.success) throw r.error; });

   const routes = new Hono<AppEnv>();
   routes.get("/", async (c) =>
     c.json({ items: await listWidgets(c.var.ctx, c.var.tenant.orgId) }));
   routes.post("/", requireRole("editor"), zValidator("json", z.object({ name: z.string().min(1).max(200) })),
     async (c) => c.json(await createWidget(c.var.ctx, c.var.tenant.orgId, c.req.valid("json")), 201));
   export default routes;
   ```

3. **Mount it in `src/worker/app.ts`.** Tenant routers go on the org sub-app, which already has
   `requireOrg("viewer")`: `org.route("/widgets", widgetRoutes)`. Signed-in, non-tenant routers go
   after `sessionMiddleware`: `app.route("/api/widgets", …)`. Webhooks and other routes that verify
   their own signatures go before `originCheck`, like `/api/billing/webhook`. `app.ts` only mounts
   routers; never put logic there.
4. **Queue jobs:** add a variant to `JobMessage` in `queues/messages.ts` (ids only, never content or
   PII) and map it in `queues/handlers.ts` (a type-checked, exhaustive map). Produce jobs with
   `enqueue(ctx, job)` so they run inline in tests. Handlers must be idempotent, because the queue
   retries up to 3 times before the DLQ.
5. **Contracts:** put DTOs in `src/shared/api/types.ts` and enums in `src/shared/enums.ts` (add values,
   never rename them). Follow the API conventions in ARCHITECTURE.md: lists are `{ items, nextCursor? }`,
   errors use `AppError` helpers from `lib/errors.ts` (`notFound`, `forbidden`, `badRequest`, …),
   money is integer cents, ids come from `newId(prefix)` (add the prefix to `IdPrefix` in
   `lib/ids.ts`).
6. **UI page:** add the component under `src/client/routes/org/<area>/`, then wire it in
   `src/client/router.tsx` with `r("/widgets", WidgetsPage)` inside `orgLayout.addChildren([...])`
   (public pages go under `publicLayout`). Add it to the navigation in `components/layout/org-layout.tsx`.
   Put the area's data hooks in a `queries.ts` (TanStack Query), call the API through
   `api(orgApi(orgId, "/widgets"))` from `lib/api.ts`, and build from `components/ui`.
7. **Foundation files** (`app.ts`, `context.ts`, `router.tsx`, `queues/*`, `db/schema/_columns.ts`,
   `shared/enums.ts`, `shared/content.ts`, `ports/fake-llm-handlers.ts`) change only in the integration
   pass. If you need a change there, write exactly what you need in your PR or final report.
8. Update `docs/MODULES.md`, and the endpoint contract in ARCHITECTURE.md (or ask its owner to).

## 6. Adding an LLM purpose

1. **Name it** `<module>.<action>` and export it as a constant (`export const SUMMARIZE_PURPOSE =
   "knowledge.summarize"`). Fakes, telemetry (`llm_calls.purpose`) and per-purpose model overrides all
   use this key.
2. **Call it only through `ctx.llm`** (`ports/llm.ts`):

   ```ts
   const { data } = await ctx.llm.generateStructured({
     purpose: SUMMARIZE_PURPOSE,
     orgId, applicationId,          // cost attribution in llm_calls (and future spend caps)
     system: SYSTEM_PROMPT,         // stable: no ids, dates or timestamps (keeps the prompt cache warm)
     context: factsBlock,           // large, stable for each org; cached
     prompt: taskPrompt,            // the volatile part goes last
     schema: SummaryOutput,         // zod; no numeric min/max (not enforced): clamp afterwards
     effort: "medium",
   });
   ```

   Never hardcode a model. The default comes from `LLM_MODEL` (`claude-haiku-5-5`: the cheapest model that does the job; move a purpose up only on eval evidence). Handle
   `LlmRefusalError` and `LlmOutputError`. If the output asserts anything about the org, it must go
   through facts and cited claims (section 8).
3. **Add a fake handler** in `services/<module>/fake-llm.ts`:
   `export const fakeHandlers: Record<string, FakeHandler> = { [SUMMARIZE_PURPOSE]: (req) => … }`.
   It must be deterministic, pass the schema, and be honest: build output only from what is in
   `req.prompt` or `req.context`, never invent content. For a new module, add one import line to
   `ports/fake-llm-handlers.ts` (integration pass). Without a handler, tests and the demo fail with
   `FakeLlm has no handler for purpose …`.
4. **Tests:** a unit test for the prompt builder and any post-processing, and a worker test through
   the fake. Cover edge cases with `new FakeLlm(allFakeHandlers).on(PURPOSE, () => …)` (refusal,
   invalid output, empty result) and pass it as `createAppContext(env, { llm })`.
5. **Add an eval.** If the purpose writes or judges text that can reach a funder, add cases to
   `evals/` (fixtures in `evals/fixtures/`, metrics and gates in `evals/run.ts`; see docs/EVALS.md).
   Run `--fake` in the PR and a real run (with a key, or the `grants-llm-evals` workflow) before
   merging a prompt change. Bump the module's `PROMPT_VERSION` when a prompt changes.
6. **Cost:** if the purpose runs per application or per billed unit, add a stage to `STAGE_TOKENS` in
   `src/shared/billing/cost-model.ts`, run `pnpm test:unit` (the margin band test), and measure with
   `evals/cost-benchmark.ts`.

## 7. Adding a table or column

1. Edit the domain schema file in `src/worker/db/schema/<domain>.ts` (add tables or columns; don't
   rename). **A new file must be exported from `db/schema/index.ts`.** Otherwise the table is missing
   from migrations, the test schema, and org export and deletion. Use the helpers in
   `_columns.ts` (`createdAt()`, `updatedAt()`, `ts()`, `bool()`, `json<T>()`, `cents()`).
2. **Tenant tables** need `orgId: text("org_id").notNull().references(() => organization.id,
   { onDelete: "cascade" })` and an index that starts with `org_id`. That is enough for export and
   deletion to include the table automatically (`privacy/tenant-tables.ts`). If the table depends on
   another tenant table through `RESTRICT`, add it to `DELETE_FIRST` there.
3. Run `pnpm db:generate --name <change>`. drizzle-kit writes `migrations/NNNN_<change>.sql`. Until the
   baseline migration is committed, coordinate with the integration pass, because only one baseline
   may exist.
4. **Review the generated SQL before committing:**
   - It should be additive: `CREATE TABLE`, `CREATE INDEX`, or `ALTER TABLE … ADD COLUMN` with a
     default or nullable.
   - **Reject table rebuilds** (`__new_<table>`, `INSERT … SELECT`, `DROP TABLE`, `RENAME`) of any table
     that other tables reference with `ON DELETE CASCADE` (`organization`, `applications`, `documents`,
     …). D1 doesn't let you turn foreign keys off, and dropping a parent table fires its cascades, which
     can delete tenant data. Split the change into additive steps instead.
   - Never edit a migration that has already been applied. Add a new one.
   - Apply it locally (`pnpm db:migrate:local`) and run the affected worker tests (tests build the
     schema from `drizzle-kit export`, not from migrations).
5. If the table holds personal data, update docs/DATA_POLICY.md and, when user-facing behaviour changes,
   `docs/legal/*.md`. Then run `node docs/legal/sync-documents.mjs` and bump `POLICY_VERSION` in
   `src/shared/legal.ts`.

## 8. Coding rules

**Tenancy (ADR 0003)**
- Every query on a tenant table filters by `c.var.tenant.orgId`. Lookups by id also match the org:
  `and(eq(t.id, id), eq(t.orgId, orgId))`. Never trust an `orgId` (or any owner id) from a request body.
- Non-members get 404, never 403. Writes use `requireRole("editor")`; settings, members, billing and
  privacy deletions use `admin` or `owner`.
- R2 keys start with `orgs/{orgId}/`. The Vectorize namespace is the orgId. Private opportunities use
  `privateToOrgId`, and catalog reads go through `visibleTo(orgId)`.

**No fabrication (ADR 0004 and ADR 0005)**
- The LLM never invents facts. Drafts may assert only what cited facts state. If the facts can't
  answer, emit a `gap`; never fill one with plausible text.
- `restricted`, `rejected` and `superseded` facts never reach drafting prompts. Extracted facts start
  as `proposed` with a verbatim `sourceQuote`.
- Don't weaken the grounding verifier, autopilot gates or eval gates without an ADR update. Anything
  that can't be verified becomes a flag (fail closed).
- Fakes must be honest too (copy or derive from the input, never make things up), or the demo teaches
  the wrong behaviour.

**No secrets or customer content in logs**
- `ctx.logger` fields carry ids, counts, statuses and error classes only. Never log document text,
  interview answers, prompts or model output, emails or names, tokens, API keys, cookies, request
  bodies or query strings.
- Queue messages and `audit_log` metadata carry ids and counts only. Store IPs only as `hashIp()`.
- Secrets live in `.dev.vars` or `wrangler secret put`, never in `wrangler.jsonc` `vars` or in code.

**General**
- Strict TypeScript with no `any`. Use the `@shared/*`, `@worker/*` and `@client/*` aliases. Validate
  every input with zod.
- Write `audit()` (`services/privacy/audit.ts`) for consequential actions: role changes, fact
  confirmation, routing decisions, submissions, exports, deletions.
- Keep cron handlers cheap: enqueue jobs and do the work in the job.
- Agents working in the shared checkout don't commit, push, stash, check out or reset. The orchestrator
  commits.

## 9. PR checklist

- [ ] `pnpm typecheck`, `pnpm exec biome check --write <files>`, and targeted `test:unit` and
      `test:worker` runs pass. CI is green.
- [ ] New logic has tests. Every new or changed router has a **cross-tenant** test (404 for other orgs)
      and role tests for its writes.
- [ ] Every query on a tenant table filters by orgId. R2 keys and vector namespaces are scoped to the org.
- [ ] Every new LLM purpose goes through `ctx.llm`, has a FakeLlm handler, has tests, and has an eval
      or cost-model entry where relevant. Prompt changes bump `PROMPT_VERSION` and passed `evals/run.ts`.
- [ ] Nothing lets a draft assert something that isn't in the fact base. Verifier and autopilot gates are
      unchanged, or an ADR is updated.
- [ ] No secrets, document contents or PII in logs, queue messages, audit metadata or committed files.
- [ ] Schema changes: generated migration reviewed (additive, no cascade-firing rebuilds) and applied
      locally. DATA_POLICY.md and legal docs updated if personal data changed.
- [ ] No new dependencies or lockfile edits, unless you were asked for them.
- [ ] Foundation-file changes are listed for the integration pass.
- [ ] Docs updated: MODULES.md, the ARCHITECTURE.md endpoint contract, GLOSSARY.md (new terms), and an
      ADR for any decision that changes the architecture.
- [ ] User-visible flow changed? The e2e spec is updated, and the offline demo still works end to end.
