# PayApps worker tests: pre-bundle the runtime deps (2026-11-27)

Perf track, version 0, item 3 ("the slowest local step an agent session waits
on"). There was no agent-workable `perf:` backlog item (P063, P064 and P086
are owner rows). PayApps is bet #1 and moved into this repository today
(`ventures/payapps`, task `move-payapps-public`), so every payapps PR now
runs `payapps-ci.yml` here, and nobody had timed that suite.

## Reading (before, `origin/main` `991a8c4b2`)

Each step of the `app` job, run one after another in a 4-core cloud
container after `pnpm install --frozen-lockfile` (5.9 s):

| step | seconds |
|---|---:|
| `biome ci .` | 1.1 |
| `pnpm typecheck` | 24.6 |
| `pnpm test:unit` (144 files) | 24.1 |
| **`pnpm test:worker` (87 files, 552 tests)** | **195.3** (second run 193.3) |
| `pnpm build` | 3.2 |

`test:worker` is 80% of the job. Vitest's summary splits it as
"transform 52%, tests 33%, import 14%". The JSON reporter showed test bodies
summing to 137 s across files. Laying file start and end times on a timeline,
the suite spent 70 s with no file running tests at all: that was module
loading.

One file, `--experimental.importDurations.print`:

```
test/worker/rfis.test.ts                 14ms  3.20s
src/worker/services/auth/auth.ts         16ms  2.17s
better-auth/dist/auth/minimal.mjs        11ms  1.21s
...
Total import time (self/total): 226ms / 17.35s
```

Summed self time by package: zod 613 ms over 72 modules, better-auth,
drizzle-orm (20 modules), jose, hono, better-call and @noble. The
`cloudflareTest` pool gives every file a fresh isolate, so each of the 87
files pays these ~3 s again, as hundreds of separate module fetches from the
Vite server.

## Change

`apps/payapps/vitest.worker.config.ts` turns on Vitest's SSR dependency
optimizer (`test.deps.optimizer.ssr`) for the entry points `src/` and
`test/` actually import: `better-auth/minimal`, `better-auth/adapters/drizzle`,
`zod`, `drizzle-orm`, `drizzle-orm/sqlite-core`, `drizzle-orm/d1`, `hono`,
`hono/factory` and `hono/http-exception`. `node:*` stays external
(`rolldownOptions.external`), since workerd provides it via `nodejs_compat`.

Two dead ends on the way, so the next run skips them:

- Globs (`better-auth/**`, `hono/**`) pull in every subpath, including
  `hono/context-storage` and the node-only password module, and the
  optimizer fails on `node:async_hooks` / `node:crypto`. List bare entry
  points instead.
- Without the `node:` external, `@better-auth/utils/password` still fails:
  its `workerd` and `node` export conditions both point at
  `password.node.mjs`, which imports `node:crypto`. That is the same file the
  unbundled path loads, so bundling does not change which code runs.

## Verification

- `pnpm test:worker`: **87 files, 552 tests passed** (same counts as before),
  warm optimizer cache **99.1 s**; cold (`rm -rf node_modules/.vite`, what CI
  sees) **121.6 s**. Before: 195.3 s and 193.3 s.
- The single file above: import 3.20 s -> 2.05 s.
- `biome ci .` and `pnpm typecheck` pass.
- No test, include pattern or isolation setting changed.

## Not changed (ranked, for the next run)

1. **`isolate: false`** for the worker pool. Vitest estimates at least 16 s
   more saved (87 isolates at ~585 ms startup). Not done: files would share
   D1 state and module singletons (`testFakes` in `@worker/context`), and the
   setup's "schema exists, skip" check assumes a fresh database per file.
   Worth a try only with a full run proving no order-dependence.
2. **Our own source transform**: `auth.ts` 465 ms self, `db/schema/*` about
   700 ms per file after the change. That is Vite transforming TypeScript per
   isolate; Vite's transform cache should already hold it, so check whether
   the pool re-requests it before chasing.
3. **`pnpm typecheck`** (24.6 s) and **`test:unit`** (24.1 s; Vitest says
   ~8 s faster with `isolate: false` in happy-dom/node). Smaller wins.
4. The `site` job's worker suite is 2 files, 1.8 s: nothing to gain.

## Second pass: one isolate per worker (same day, later run)

Perf track, version 0, again item 3. Not-changed item 1 above (`isolate: false`)
turned out to be the big lever, and trying it found a production bug.

### Reading (before, `origin/main` `1931c58db`)

Cold (`rm -rf node_modules/.vite`) `pnpm test:worker` in the same 4-core
container: **156.2 s**, 88 files, 559 tests (`Duration 153.13s (tests 57%,
transform 34%, import 8%)`). From the JSON reporter: test bodies sum to
171 s, and **119 s of it is the first test of each file** (median first test
1,725 ms; median of every other test 79 ms). The first test's first
`worker.fetch` loads the Worker's ~300-module graph into a fresh isolate; the
optimizer from the first pass only bundled the dependencies, not our own
source. Every file paid that again.

### Change

1. `vitest.worker.config.ts`: `isolate: false`. Each of the 4 Vitest workers
   keeps one isolate (and one local D1) for all its files.
2. `src/worker/services/admin/metrics.ts`: the admin console's account list
   looked up org owners with one `IN (...)` binding every listed org id.
   D1 refuses a statement with more than 100 bound parameters and the route
   allows `limit` up to 200, so **from about 100 orgs on, `GET
   /api/admin/accounts` returned 500 in production**. The shared database
   under `isolate: false` held more than 100 orgs by the time `admin.test.ts`
   ran, which is how it surfaced (2 failures in 2 of 5 shuffled orders). The
   lookup now goes in chunks of 90 ids. All of one org's memberships land in
   the same chunk, so "earliest owner" is unchanged.
3. `test/worker/admin.test.ts`: a regression test with 120 orgs and
   `limit=200`. It fails on the old code (500) and passes on the new.
4. `test/worker/setup.ts` comment: the schema is applied once per worker now,
   which the existing "table exists, skip" check already handled.

What `isolate: false` asks of a test file is written in the config comment:
scope reads to the file's own ids, never assert a global count or an empty
table, and pass in any file order.

### Verification

- Cold `pnpm test:worker`: **31.5 s**, 88 files, **560 passed** (559 plus the
  regression test). Before: 156.2 s. Without the bug fix, 29.9 s in the
  default order with 559 passed.
- `--sequence.shuffle.files`, seeds 1 to 6: 560 passed every time. (Shuffling
  tests *inside* a file, `--sequence.shuffle`, fails 50 to 80 tests with or
  without this change: several files are written as ordered steps on one job.
  Not a regression; don't use it as the check.)
- `biome ci .` and `pnpm typecheck` pass. No test was removed, skipped or
  weakened; include patterns unchanged.

### Not changed (ranked, for the next run)

1. **Other unbounded `inArray` calls on customer paths** that can pass 100 ids
   for a big company: `daily-reports.ts:446` and `getting-started.ts:35-57`
   (one id per project in the org), `tm-tickets.ts:112/470/512` and
   `daily-reports.ts:132` (ids from the request or the page), `payments.ts:256`.
   `job-cost-qbo.ts`, `job-cost.ts` and `insurance-holders.ts` already chunk.
   A shared `chunked()` helper in `src/worker/db/` would replace four local
   copies of `chunk`.
2. **`pnpm typecheck`** (28 s) is now the slowest step of the `app` job
   (unit 27.6 s, worker 31.5 s, build 3 s). `tsc --incremental` does not help
   a cold CI runner.
3. **`test:unit` `isolate: false`**: Vitest estimates about 9 s on 149 files.
   React component files share happy-dom state, so it needs the same shuffled
   proof.
