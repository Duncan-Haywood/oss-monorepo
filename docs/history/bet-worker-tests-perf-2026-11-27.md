# Job Shop Quote and Seller Books worker tests: pre-bundle the runtime deps (2026-11-27)

Perf track, version 0. No agent-workable `perf:` backlog item (P063, P064,
P086 are owner rows). A fresh pool reading
(`ci_profile.py --runs 600 --top 15`, 09:28 to 09:57 UTC) put the three
product CIs that moved into this repository today among the larger consumers,
each with `pnpm test:worker` as its heaviest step:

| workflow | job-min in window | heaviest step |
|---|---:|---|
| payapps CI (bet #1) | 25.5 | `pnpm test:worker` (9.6 m) |
| jobshop-quote CI (bet #2) | 3.9 (300-run window) | `pnpm test:worker` (2.2 m) |
| seller-books CI (bet #5) | 4.2 (300-run window) | `pnpm test:worker` (1.4 m) |

PayApps already got the fix earlier today (PR #19655,
`payapps-worker-tests-perf-2026-11-27.md`): Vitest's SSR dependency optimizer
for the bare entry points the Worker imports, so each file's fresh workerd
isolate loads a few pre-bundled modules instead of hundreds of small ones.
The two sibling apps share the same scaffold (better-auth, zod, drizzle,
hono, `cloudflareTest` pool, a fresh isolate per file) and had not had it.

## Change

`vitest.worker.config.ts` in `ventures/jobshop-quote/apps/jobshop-quote` and
`ventures/seller-books/apps/seller-books` gains the same `test.deps.optimizer.ssr`
block as payapps. Entry lists come from grepping each app's `src/worker`,
`src/shared` and `test/worker` imports:

- both: `better-auth/minimal`, `better-auth/adapters/drizzle`, `zod`,
  `drizzle-orm`, `drizzle-orm/sqlite-core`, `drizzle-orm/d1`, `hono`,
  `hono/factory`, `hono/http-exception`, `@hono/zod-validator`;
- jobshop-quote also `@anthropic-ai/sdk` (the LLM port imports it statically);
- seller-books also `drizzle-orm/batch`.

`node:*` stays external, as in payapps. No test, include pattern or isolation
setting changed.

## Verification (4-core cloud container, one suite at a time)

| suite | before | after | files / tests |
|---|---|---|---|
| jobshop-quote `test:worker` | 114.4 s, 112.2 s | 67.7 s (cold), 91.2 s (warm), 91.6 s (cold) | 45 / 282 both sides |
| seller-books `test:worker` | 59.7 s | 29.3 s (cold), 29.5 s (warm) | 25 / 133 both sides |

"Cold" means `node_modules/.vite` removed first, which is what CI sees.
Vitest's own split moves from "transform 47%, import 16%" to "tests 54%,
import 7%" for jobshop-quote: what is left is mostly test bodies (the
quote-pipeline and PDF tests), so its gain is smaller (~20 to 40%) and
noisier than seller-books' (~50%). `biome ci` passes on both changed files.

## Not changed (ranked, for the next run)

1. **jobshop-quote test bodies** now dominate (54%). `--reporter=json` and sum
   per-file durations before guessing; the drawing-PDF and STEP fixtures are
   the likely heavy ones.
2. **`isolate: false`** for the worker pools: same caveat as payapps (shared
   D1 state, `testFakes` singletons, "schema exists, skip" in setup).
3. The `site` apps' worker suites are a couple of files each: nothing to gain.
