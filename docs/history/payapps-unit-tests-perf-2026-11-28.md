# PayApps, Job Shop Quote, CMMC and Seller Books unit tests: one worker per core, not per file (2026-11-28)

Perf track, version 0. No agent-workable `perf:` backlog item (P063, P064,
P086 are owner rows). The worker suites of all four for-profit apps already
run with `isolate: false` (`payapps-worker-tests-perf-2026-11-27.md`,
`jobshop-quote-worker-tests-perf-2026-11-27.md`,
`seller-books-worker-tests-perf-2026-11-28.md`). Their **unit** suites did
not: PayApps' own write-up ranked "`test:unit` (24.1 s; Vitest says ~8 s
faster with `isolate: false`)" third in "Not changed". `pnpm test` runs
`test:unit` before `test:worker`, so every agent session and every
`<app> CI` run waits on it.

## Reading

4-core cloud container, `pnpm install --frozen-lockfile`, cold
(`rm -rf node_modules/.vite`), `npx vitest run --config vitest.unit.config.ts`
in the app directory, nothing else running, wall clock from `date +%s.%N`.

| suite | files | tests | before | after | Vitest's own estimate |
|---|---:|---:|---:|---:|---|
| payapps | 164 | 1,576 (+4 skipped) | 26.8 s | 19.1 s | 164 spawns x ~163 ms, "at least ~8.77 s" |
| jobshop-quote | 46 | 695 | 6.1 s | 1.9 s | 46 x ~172 ms, "~2.46 s" |
| cmmc | 59 | 513 | 7.0 s | 4.5 s | 59 x ~103 ms, "~1.92 s" |
| seller-books | 41 | 403 | 3.5 s | 1.3 s | 41 x ~97 ms, "~1.23 s" |
| **total** | 310 | 3,187 | **43.4 s** | **26.8 s** | |

About 16.6 s (38%) off the four suites per cold run. Through the real
script (`pnpm test:unit`, the edited config, pnpm's start-up included):
21.0 s, 2.9 s, 4.7 s and 2.2 s, all green.

The before profile was spread across set-up, not one loop: PayApps' Vitest
summary read `tests 45%, environment 17%, import 13%, transform 12%, setup
12%`. Each file paid a fresh worker, a fresh happy-dom (43 of PayApps' files
are components), its setup file and a re-import of React and Testing
Library. Reusing the worker pays that once per core.

## Change

`vitest.unit.config.ts` in the four apps: `isolate: false`, with a comment on
what it asks of a test file (undo global changes, pass in any order). Same
tests, no test touched.

## Verification

- Full suite with `--isolate=false`, default order: every file and test
  passes in all four (counts as in the table, identical to before).
- `--sequence.shuffle.files` with seeds 1-4 (PayApps) and 1-3 (the other
  three): all green.
- Leak audit. Global stubs: every file that calls `vi.stubGlobal` also calls
  `vi.unstubAllGlobals` (PayApps 35 of 35, CMMC 8 of 8; Job Shop Quote and
  Seller Books stub nothing). React trees: the setup's `afterEach(cleanup)`
  already unmounts them. Module mocks: one file (`attachments-convert.test.tsx`
  in PayApps) uses `vi.mock`, of `packet-photo`; it and the real module's own
  test (`packet-photo.test.ts`) pass in one worker in both orders
  (`--no-file-parallelism`, six seeds), so the mock does not leak.
- `npx biome check` on the four configs: clean.

## Not changed (ranked, for the next run)

1. **PayApps' environment time** (22% of the after run). 43 component files
   each still set up happy-dom; Vitest reuses the worker but builds the
   environment per file. Splitting the suite into a node project and a
   happy-dom project (`test.projects`) may cut it further; measure first.
2. **Shuffled order is slower** (PayApps 18.6-25.7 s across four seeds vs
   19.1 s default): the default sequencer sorts by cached duration and
   groups environments. Nothing to do, just don't read a shuffled run as the
   suite's time.
3. **`payapps-site` and `jobshop-site`** unit and worker suites are a handful
   of files each: under a second to gain.
4. `pnpm typecheck` (PayApps 24.6 s) is now the slowest local step before the
   worker suite; `tsc --build` with incremental info might help.
