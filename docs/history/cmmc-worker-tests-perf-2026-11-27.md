# CMMC worker tests: pre-bundle the runtime deps (2026-11-27)

Perf track, version 0, item 3 ("the slowest local step an agent session
waits on"). No agent-workable `perf:` backlog item (P063, P064 and P086 are
owner rows). CMMC is bet #4 and moved into this repository recently
(`ventures/cmmc`); every CMMC PR runs `cmmc-ci.yml` here, whose `app` job
runs `pnpm test:worker`. PayApps (bet #1) and Seller Books already pre-bundle
their worker-test dependencies (`docs/history/payapps-worker-tests-perf-2026-11-27.md`);
CMMC was the one product worker suite without it (jobshop-quote has it too;
the `*-site` suites are small and plain).

## Reading

4-core cloud container, `pnpm install --frozen-lockfile` once, then
`pnpm test:worker` in `ventures/cmmc/apps/cmmc` with nothing else running.
Wall time from `date` around the command; "Duration" is Vitest's summary.

| run | Vitest duration | wall | split |
|---|---:|---:|---|
| before 1 (`origin/main` `c8faf94fe`) | 70.18 s | 72.7 s | transform 48%, tests 41%, import 11% |
| before 2 (same tree, after the change was stashed) | 60.91 s | 62.8 s | transform 45%, tests 43%, import 12% |
| after 1 | 54.54 s | 57.5 s | tests 73%, transform 22%, import 5% |
| after 2 | 51.68 s | 53.7 s | tests 71%, transform 23%, import 5% |

Mean 65.5 s -> 53.1 s, about 19% (12 s) per run, with the same 22 files and
156 tests passing in every run. The before runs are noisy (10 s apart); the
smallest before beats the largest after by 6 s, so the gain is real but
smaller than PayApps' (193 s -> 99-121 s, 87 files), as expected for a suite
with a quarter of the files: the per-file module-loading cost is what the
bundle removes.

## Change

`ventures/cmmc/apps/cmmc/vitest.worker.config.ts` turns on
`test.deps.optimizer.ssr` with the same bare entry points as PayApps
(`better-auth/minimal`, `better-auth/adapters/drizzle`, `zod`, `drizzle-orm`,
`drizzle-orm/sqlite-core`, `drizzle-orm/d1`, `hono`, `hono/factory`,
`hono/http-exception`) plus `@hono/zod-validator`, which CMMC's
`src/worker/lib/validate.ts` uses for every router. `node:*` stays external.
`hono/utils/http-status` is a type-only import and needs no entry.

Same answers: test-only config; the Worker build (`vite.config.ts`) is
untouched, and the suite's pass set is identical (156/156). `biome ci .` and
`pnpm typecheck` pass.

## Not changed (ranked for the next run)

1. **`isolate: false`.** Vitest's own hint says "at least ~5 s faster". Not
   taken: each file applies the schema fresh in `test/worker/setup.ts`, and
   sharing a workerd isolate across files would need the tests audited for
   module-level state first. Worth a measured try with that audit.
2. **Test bodies** are now 71-73% of the run. `--reporter=json` per-file
   times would show whether one file (the PDF and document tests log the
   most) dominates.
3. **`exportSchemaSql()`** spawns `drizzle-kit export` once per config load
   (about 1-2 s); small, and it guarantees the schema matches.
