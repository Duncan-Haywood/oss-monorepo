# payapps: the Worker's cold start, two tables built on first use (2026-11-28)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4). The perf backlog had no
agent-workable item (P063, P064 and P086 are owner rows). Bet #1 (`portfolio/monetization/bets.md`)
already had three perf passes (app first load, unit tests, worker tests), but nobody had measured
the startup of its Cloudflare Worker (`apps/payapps/src/worker/index.ts`). Each new isolate loads the
whole bundle before it answers, and a product with few customers sees a high share of cold isolates.
The einvoice-pro run the same day (`einvoice-pro-worker-cold-start-perf-2026-11-28.md`) used the
same method.

## Readings

**The bundle.** `npx vite build` (the Cloudflare Vite plugin writes `dist/payapps/`):
`index.js` 2,725 KB (678 KB gzip) plus `factory-*.js` 293 KB (zod and Better Auth's shared code)
and `dist-*.js` 16 KB. Well under the 3 MB gzip Free-plan limit. By source (source map,
`sourcesContent` length): better-auth 360 KB, @better-auth/core 194 KB, drizzle-orm 175 KB, jose
91 KB, hono 83 KB, @noble/ciphers 80 KB, then our own `public-jobs.ts`, `quickbooks.ts`, `schemas.ts`.

**Startup in workerd.** `npx wrangler check startup -c dist/payapps/wrangler.json` (wrangler
4.165.0, the app's pin), "Active" CPU, 7 runs, 4-core cloud container:

| | runs (ms) | median |
|---|---|---:|
| before | 66.5, 68.0, 86.1, 77.3, 65.8, 101.4, 67.2 | **68.0** |
| after | 51.5, 52.1, 48.8, 51.9, 66.1, 57.3, 61.0 | **52.1** |

**Node import of the built `index.js`** (`await import()`, wall clock, includes Node's loader):
before median 114.0 ms, after 98.1 ms; a second set with old and new bundles interleaved, 7 pairs:
**109.7 → 93.6 ms**.

**The profile.** workerd's startup profile had 4 samples, so it cannot attribute anything. Node
with `--cpu-prof --cpu-prof-interval 50`, self time mapped back through the source map: about 58 ms
is V8 compiling the module and the rest is evaluation. The top-level function (every module's
top-level code, hoisted into one scope by Rolldown) had 181 self samples. 85 of them sat on one line,
`new Intl.NumberFormat("en-US", { style: "currency" ... })` in `src/shared/money.ts`, and 39 on the
AES table loop in `src/shared/pdf/crypt.ts`. That loop found each byte's GF(2^8) inverse by
trying every candidate: about 33,000 `gmul` calls, then 1,024 more for the four InvMixColumns
tables. After the change the top-level function has 59 self samples.

## Change

- `src/shared/pdf/crypt.ts`: `SBOX`, `INV_SBOX` and `MUL9/11/13/14` are filled by `buildTables()`
  on the first `aesCbcDecrypt` call. The arithmetic is the same code, moved into the function. It
  is used only when an imported PDF has an owner password. This module ships in the browser bundle
  too, so the page's load saves the same work.
- `src/shared/money.ts`: the USD `Intl.NumberFormat` is created on the first `formatCents` call
  (`??=`), with the same options. Most API requests return JSON and format no money.

## Verification

- **Same answers.** The formatter and its options are the same object and the table code is the
  same code, now run later. `src/shared/pdf/crypt.test.ts` checks `aesCbcDecrypt` against
  Node's `createCipheriv` for AES-128 and AES-256, and the encrypted-PDF fixtures import as before.
- `pnpm test:unit`: 164 files, 1,599 passed, 4 skipped. `pnpm typecheck` exits 0, and
  `biome check` is clean on both files. `pnpm test:worker`: see the run record's notes.

## What this says

The cold start was not a problem before: 68 ms against Cloudflare's 1 s startup limit. This takes
about 23% off it in workerd. The rest is spread out: V8 compiling 2.7 MB, zod building its
classes and schemas (`factory-*.js` `init`, ~16 ms in Node) and drizzle's table definitions (~4 ms).
None of those is one statement you can move.

## Not changed, ranked for the next run

1. **Route modules loaded on demand.** `app.ts` statically imports 40 route files and every service
   behind them. Hono can mount a lazily imported sub-app, but every request would then pay an
   `await import()`. Workers bundle it into one script anyway, so this only skips evaluation, not
   compilation. Measure the share of `(anon) index.js` evaluation that is route setup first.
2. **zod schemas at module top level** (`src/shared/api/schemas.ts`, 55 KB source, plus Better
   Auth's own). Building them lazily changes how 40 routes declare validators. That is a big
   diff for a few ms.
3. **`retainage-release.ts:63`** makes a new `Intl.NumberFormat` on every call. That costs
   nothing at startup, but a hot loop would notice. It could use `formatCents`. Its options differ
   (no `minimumFractionDigits`, which is 2 for USD anyway), so pin the output before switching.
