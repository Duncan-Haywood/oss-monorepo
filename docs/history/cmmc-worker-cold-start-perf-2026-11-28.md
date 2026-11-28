# cmmc: the Worker's cold start, Anthropic SDK loaded on first use, and a bench that measures what it says (2026-11-28)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4). The perf backlog had no
agent-workable item (P063, P064 and P086 are owner rows). Bet #4, CMMC Workspace
(`portfolio/monetization/bets.md`), had app first-load and worker-test passes on 2026-11-27, but
nobody had measured its Cloudflare Worker's startup. Three runs that day measured the same thing
for payapps, einvoice-pro and jobshop-quote
(`payapps-worker-cold-start-perf-2026-11-28.md`, `einvoice-pro-worker-cold-start-perf-2026-11-28.md`,
and open PR #20139 for jobshop-quote). The jobshop doc's first "not changed" item was this adapter.

## A measuring trap, found first

`npx wrangler check startup -c <path>/wrangler.json`, **run from the app's directory**
(`apps/cmmc`), ignores `-c` when the config is a copy elsewhere. It profiles the app's own current
`dist/`. Evidence: with `-c` pointing at the saved *before* copy, the profile's URLs were
`apps/cmmc/index.js` and `assets/factory-Do8adU9w.js`, which are the *after* build's hashes. So my
first 19 "interleaved before/after" pairs compared the new bundle with itself (39.6 vs 40.6 ms
median). A do-nothing Worker given cmmc's config "read" 35 to 44 ms the same way. I briefly took
that as a runtime floor equal to cmmc's whole Worker, which was wrong. Run from the config's own
directory, the do-nothing Worker reads **0.0 ms** (range 0 to 4.6).

What this means for the other runs that day: payapps measured *before*, rebuilt, then measured
*after*, so each reading was of the build in `dist/` at the time and its numbers hold. jobshop-quote
(PR #20139) says "old and new bundles interleaved". If those ran from the app directory, both
columns measured the same bundle and the 67.7 → 59.9 ms is noise. Its Node import numbers
(128 → 105 ms) are unaffected. Worth re-taking with the bench below before citing it.

**The fix is software, not a note.** `platform/perf/worker-startup.mjs` takes before/after dist
directories (or `wrangler.json` files) and runs `wrangler check startup` on each from that config's
own directory. It interleaves them, rotating the order each round, alongside a do-nothing Worker
with the same compatibility date and flags. It prints each median, its range, and the median
above the floor. `worker-startup.test.mjs` covers the parsing and config parts. The perf prompt
(item 4) now names it and the trap.

## Readings

**The bundle.** `npx vite build` in `apps/cmmc` (the Cloudflare Vite plugin writes
`dist/cmmc_workspace/`). Code the entry loads statically (`import ... from`, not `import()`):

| | `index.js` | static chunks | eager total | lazy chunks |
|---|---:|---|---:|---|
| before | 2,663 KB (593 KB gzip) | `factory` 295 KB, runtime 0.5 KB | **2,958 KB** | `node` 116 KB, `promise` 27 KB, `dist` 16 KB |
| after | 1,607 KB (396 KB gzip) | `factory` 169 KB, `json-schema-processors` 131 KB, runtime 0.5 KB | **1,907 KB** | `sdk` 1,095 KB, `node` 116 KB, `values` 12 KB, `zod` 6 KB, `dist` 16 KB |

Source by package (source map `sourcesContent` length): **`@anthropic-ai/sdk` 1,305 KiB**,
better-auth 360 KiB, @better-auth/core 194 KiB, drizzle-orm 175 KiB, jose 91 KiB, hono 83 KiB,
@noble/ciphers 80 KiB, then our own `routes/org/index.ts` 57 KiB and `controls/level2.ts` 46 KiB. The
SDK is used by one file, `src/worker/ports/anthropic-llm.ts`, which runs only when a request calls
a model. Sign-in, the controls, POA&M, documents, suppliers and every other route never touch it.

**The profile.** Node `--cpu-prof --cpu-prof-interval 50` on `await import()` of the built
`index.js`, self time by function: of 994 samples (~50 ms), **440 were V8's
`compileSourceTextModule`**. Evaluation was spread thin: zod's `init` 34, drizzle's column
builders a few. There was no single hot statement like payapps' `Intl.NumberFormat`. So the lever is
how much code a cold isolate parses, and the SDK is the largest piece that most requests don't use.
workerd's own startup profile has 35 samples and can't attribute anything finer than files. It
shows the `sdk-*.js` chunk is never evaluated after the change.

**Startup in workerd**, with `node platform/perf/worker-startup.mjs --wrangler
<app>/node_modules/.bin/wrangler <before> <after>` (wrangler 4.165.0, the app's pin), "Active" CPU,
4-core cloud container:

| set | floor | before | after | change |
|---|---:|---:|---:|---:|
| 9 rounds, quiet machine | 0.0 | 45.1 (39.7–64.1) | **40.2** (36.4–53.1) | −11% |
| 15 rounds, test suites running alongside | 0.0 | 41.7 (38.4–54.3) | **37.3** (35.2–53.9) | −11% |

**Node import of the built `index.js`** (wall clock, includes Node's loader), 7 interleaved pairs:
before median **80.4 ms**, after **62.5 ms** (−22%).

## Change

`ventures/cmmc/apps/cmmc/src/worker/ports/anthropic-llm.ts`, the same shape as jobshop-quote's
PR #20139:

- `import Anthropic from "@anthropic-ai/sdk"` became `import type`, and the zod helper import is
  gone from the top. A module-level `loadSdk()` runs both `import()`s once per isolate. A failed
  import isn't cached, so the next call retries.
- The constructor keeps a client passed in `opts.client` (cmmc has no caller that passes one, but
  the option stays). Otherwise `sdkClient()` builds one on the first `generateText` /
  `generateStructured` call, with the same options (`apiKey`, `maxRetries: 3`). `started` is taken
  after the load, so `latencyMs` still measures the API call only.

The first model call in an isolate pays the import (Node: ~20 ms), against a model call that
takes seconds.

## Verification

- **Same answers.** cmmc had no test of this adapter. `anthropic-llm.test.ts` adds six: the
  fallback flag by model; `generateText` and `generateStructured` through the real SDK with `fetch`
  stubbed (URL, model, fallback flag, Zod `json_schema` output format, parsed reply, usage callback,
  client reused); an injected `client` used instead of a new one; a refusal still raising
  `LlmRefusalError`; and a source check that the only top-level SDK import is `import type`. With
  the old file swapped back, the five behaviour tests pass and only the source check fails, as
  intended.
- `pnpm test:unit`: 55 files, 573 passed. `pnpm test:worker`: 27 files, 185 passed. `tsc --noEmit`
  exits 0. `biome check .` is clean on 350 files. `node --test platform/perf/worker-startup.test.mjs`:
  4 passed.

## What this says

The cold start was never close to a limit: about 42 ms of the Worker's own CPU against
Cloudflare's 1 s startup ceiling. This takes about a tenth off it in workerd and a third off the
code a cold isolate parses (2.96 MB to 1.91 MB). The bigger lesson is the method. A before/after
startup reading needs each config run from its own directory, interleaved, and checked against a
floor. Until today none of the three cold-start docs did all of that.

## Not changed, ranked for the next run

1. **Re-take jobshop-quote's workerd numbers** (PR #20139, or its doc once merged) with
   `worker-startup.mjs`. Its code change is sound either way. Only the 67.7 → 59.9 ms claim is in
   doubt.
2. **seller-books (bet #5) has no Worker cold-start reading.** Check whether it imports the
   Anthropic SDK statically too (`grep -rn '@anthropic-ai/sdk' ventures/seller-books`).
3. **`routes/org/index.ts`** (57 KiB source) and the Level 2 control catalogue (`controls/level2.ts`,
   46 KiB) are eager on every route. The catalogue is data the controls pages need, so lazy loading
   saves little that matters. Measure first.
4. **Better Auth** (360 + 194 KiB source) runs on every authenticated request. Leave it.
