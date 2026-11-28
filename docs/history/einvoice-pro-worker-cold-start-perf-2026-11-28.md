# einvoice-pro: the paid Worker's cold start, measured in workerd (2026-11-28)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4). The perf backlog
had no agent-workable item (P063, P064 and P086 are owner rows). Bet #3
(`portfolio/monetization/bets.md`) was the only bet moved into `ventures/` on 2026-11-27 that
had no first-load or test-suite perf pass. Its paid layer runs on a Cloudflare Worker
(`apps/einvoice-preflight/worker/index.mjs`), so each new isolate's startup comes before a
customer's first check or sign-in.

## Readings

**Test suites (CI job `einvoice-pro-ci.yml`, `app`), 4 cores, Node 22.23.** These are not the lever:

| step | wall time |
|---|---:|
| `node --test pro/*.test.mjs` (303 tests) | 4.5 s |
| `node --test --test-concurrency=4 *.test.mjs` (2,403 tests, no official-rules deps) | 10 s |

The slowest single test is 985 ms (`zatca-stamp` mangling). Nothing here is worth an agent's time.

**The Worker bundle.** `wrangler@4.165.0` (the deploy workflow's pin), `node worker/build.mjs`,
then `wrangler deploy --dry-run --outdir`: **11,605 KiB, 2,122 KiB gzip**. That is under the
3 MB gzip limit on Workers Free and the 10 MB limit on Paid, with about 0.9 MB of headroom on Free.
What it holds, from the source map:

| source | KiB |
|---|---:|
| `worker/files.generated.mjs` (rule-set JSON 7.0 MB, page, legal texts, fonts) | 7,130 |
| `mx-address-data.mjs` (Mexico) | 469 |
| `abrasf-xsd-data.mjs` (Brazil) | 374 |
| `plain/fontoxpath.esm.js` | 318 |
| `cfdi-xsd-data.mjs` (Mexico) | 210 |
| `facturx-xsd-data.mjs` | 196 |
| `tom-data.mjs` (Brazil) | 172 |
| 201 more | ~3,500 |

**Startup.** `wrangler check startup` runs the Worker's startup in the local workerd and writes
its CPU profile. Five runs each, alternating trees (`git stash`):

| | active CPU (ms), 5 runs | median |
|---|---|---:|
| before | 54.4, 65.6, 70.5, 77.3, 82.1 | **70.5** |
| after | 59.8, 60.9, 62.1, 69.3, 101.7 | **62.1** |

Node gives the same picture. Importing the bundled `index.js` five times each:
before 210–247 ms (median 222), after 183–212 ms (median 194). Node's figure includes its own
loader, so it reads higher than workerd's.

## Change

The paid copy of `report.mjs` still statically imported Mexico's and Brazil's six checkers.
The free edition stopped doing that on 2026-11-25
(`einvoice-page-perf-2026-11-25-national-checkers-on-demand.md`), but the paid copy had
diverged and did not get the change. esbuild turns an `import()` into a lazily run `__esm`
initialiser, so the bundle stays the same size (11,620 KiB after). The national data
literals are no longer compiled and run at startup, though. They load only when a CFDI or a
Brazilian file arrives.

- New `national-sniff.mjs` holds the six `looksLike*` sniffers and `NFE_NS`/`NFSE_NS`. They are
  **this copy's own versions** (which use `xml-text.mjs`'s `declaresNamespace`), moved verbatim,
  not the free edition's.
- The six checker modules re-export them, so every other import still works.
- `report.mjs` does `await import("./cfdi.mjs")` (and the same for the five Brazilian modules)
  inside each format's branch. `preflightDocuments` was already async.
- `national-sniff.test.mjs` pins all of this: none of the six is a static import, the sniff
  module imports only `xml-text.mjs` (which imports nothing), each checker re-exports the same
  function object, and a CFDI and an NF-e still reach their checkers.

## Verification

- **Same answers.** Every `.xml`/`.json` under the app under 1 MB (outside `plain/`) went
  through `preflightDocuments` in the old tree (`git archive HEAD`) and in the new one, then
  JSON-serialised: 145 files (31 NF-e, 6 NFC-e, 14 CFDI, 13+ NFS-e, Hungarian, Polish,
  Spanish, Italian, EU). `cmp` says identical.
- **Suites.** The CI job's steps with the pinned official-rules deps: pro 303 pass, worker 27
  pass, checker 2,407 tests with 2,390 passing, 0 failing and 17 skipped. `tsc -p tsconfig.json`
  with the job's pins exits 0.

## What this says

The cold start is **not a problem**: 60 to 80 ms of active CPU against Cloudflare's 1 s
startup limit. This change takes about 12% off it, and it brings the paid copy back in line
with the free edition. The bigger finding for the next run is the size headroom. A Free-plan
deploy has about 0.9 MB gzip left, and the rule sets grow every quarter.

## Not changed, ranked for the next run

1. **Rule sets as Text modules.** 7 MB of `plain/*.json` sit in JS string literals in
   `files.generated.mjs`. Wrangler `rules` (`type: "Text"`) would load them as module data
   without JS parsing. Worth doing only if bundle size nears a plan limit; it changes the
   build and needs a real deploy to verify.
2. **Rule sets the DE/FR product never routes to** (PINT JP/MY/AE/OM, AUNZ, SG: ~1.7 MB raw).
   Leaving them out changes what the product answers for those files, so that is a product
   decision, not a perf one.
3. **`hungary-nav.mjs` (107 KiB), VERI\*FACTU and the national XSD data.** These are still
   static. They are used in the batch pre-pass (`navInputs`, `vfBatch`), so splitting them
   needs a sniff-first pre-pass. The free edition's note ranks this the same way.
