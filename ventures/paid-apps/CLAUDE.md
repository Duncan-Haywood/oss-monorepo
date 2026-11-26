# private-monorepo

## apps/seller-books — Seller Books (reseller profit + Schedule C worksheet)

Same stack and rules as apps/grants (below); read `apps/seller-books/docs/ARCHITECTURE.md` first. Same commands from
`apps/seller-books`. Fees come only from report columns: never compute a fee from an assumed rate, and any rate added to
`src/shared/reference/fee-sources.ts` needs the marketplace's own URL, a verbatim quote and the date read. Schedule C output
is a worksheet, not a filing or advice.

## apps/jobshop-quote — Job Shop Quote (RFQ to quote for CNC/fabrication shops)

Same stack and rules as apps/grants (below); read `apps/jobshop-quote/docs/ARCHITECTURE.md` first. Same commands from
`apps/jobshop-quote` (`pnpm demo` runs it offline). Prices come only from the shop's rate card through the pure engine in
`src/shared/costing.ts`: the LLM extracts (every value checked against a verbatim RFQ quote) and explains (no prices in its
text). Missing inputs are blocking issues, never guessed numbers.

## apps/grants — Grant Autopilot (Cloudflare Worker + React SPA)

Read `apps/grants/docs/ARCHITECTURE.md` first: stack, module ownership, endpoint contract, anti-fabrication rules.

Commands (run from `apps/grants`):
- `pnpm typecheck` · `pnpm test:unit` · `pnpm test:worker` · `pnpm build` · `pnpm test:e2e`
- Run a single test file: `pnpm exec vitest run --config vitest.worker.config.ts test/worker/foo.test.ts`
  (or `vitest.unit.config.ts` for unit tests). Prefer targeted runs: the machine has only 4 CPUs.
- `pnpm exec biome check --write <files>` to lint/format the files you touched (repo root has biome.json).

Rules:
- Never add dependencies or edit lockfiles/package.json without being asked (deps are pre-installed).
- Agents working in the shared local checkout: do not `git commit`, `git push`, `git stash`, `git checkout` or reset —
  the orchestrator commits. Agents in their own cloud session/checkout: commit only your own files and push to the
  branch named in your task.
- Tenant safety: every query on a tenant table filters by `c.var.tenant.orgId`; R2 keys start with `orgs/{orgId}/`.
- Never let the LLM invent facts: drafts may only assert facts from the fact base (see ARCHITECTURE.md).
- All LLM calls go through `ctx.llm` (ports/llm.ts) with a dotted `purpose`; add a FakeLlm handler for every
  purpose in your module's `fake-llm.ts` so tests and the offline demo work without an API key.
- Model: use the cheapest model that does the job correctly (owner, 2026-11-24: "use the cheapest
  model that does the job correctly ... no need to use opus for a haiku task"). Default to
  `claude-haiku-5-5`; move a purpose up to `claude-sonnet-5-5` or `claude-opus-5-5` only when that
  product's evals show the cheaper model gets it wrong, and record why in the app's docs. Grants runs
  on `claude-haiku-5-5` (env `LLM_MODEL`). Model ids come from config, never hardcoded at call sites.
- Use `@shared/*`, `@worker/*`, `@client/*` path aliases. TypeScript strict; no `any`.
- Tests are required for new logic (unit for pure functions, worker integration for routes incl. a
  cross-tenant access test).

## apps/einvoice-preflight — E-invoice fix-and-explain (zero-dependency Node)

Imported from oss-monorepo `ventures/einvoice-preflight` (MIT baseline, see its `PROVENANCE.md`); the paid
layer lives in `pro/` (read `pro/README.md` first). Tests: `node --test pro/*.test.mjs` and `node --test *.test.mjs`.
Rules: validity is decided only by deterministic code (`report.mjs` + `pro/rules.mjs`); the model only explains,
through `pro/llm.mjs` with a `FakeLlm` handler per purpose. Auto-fixes stay on the whitelist in `pro/fixes.mjs`
and must re-validate. Every store method takes `accountId` first; invoice contents are never stored.

## apps/cmmc — CMMC Workspace (same stack and rules as apps/grants)

Read `apps/cmmc/README.md`, `docs/SECURITY.md` and `docs/SOURCES.md` first. Control library is static data in
`src/shared/controls/` with citations; scoring is pure (`scoring.ts`) and tested against worked examples.
Never claim certification, C3PAO status or DoD endorsement; the app is not a CUI enclave. AI drafts stay drafts
until a person accepts them. Commands are the same as grants (`pnpm typecheck`, `pnpm test:unit`, `pnpm test:worker`).
