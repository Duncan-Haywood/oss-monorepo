# einvoice-preflight: the checker engine loads on demand (2026-11-20)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4).
The CI and agent-session lists are heavily mined (over 200 notes in this
directory) and P063/P064 remain owner-gated, so this run measured page weight
instead: the largest served venture files, then what each tool page loads
before it works.

## Reading

`ventures/einvoice-preflight/index.html` had one inline module script that
statically imported eight engine modules (report, official rules, four repair
modules, CII sniffing, audit pack) plus licence, checkout and usage. Following
the static import graph (a small walker over `import ... from "./x"`; level-6
gzip per file, summed):

| | modules | raw | gzip |
|---|---|---|---|
| static graph before | 117 | 3,273,916 B | 925,782 B |
| static graph after | 3 | 5,907 B | 2,812 B |
| on demand after (`page-engine.mjs`) | 115 | 3,269,180 B | 923,582 B |

The biggest pieces are data: `mx-address-data.mjs` 481 kB, `abrasf-xsd-data.mjs`
384 kB, `cfdi-xsd-data.mjs` 215 kB, `tom-data.mjs` 176 kB. A module script runs
only after its whole static graph has arrived and evaluated, so every handler on
the page (the sample buttons, "Check", "Repair", the hero's "see an example"
button) did nothing until about 0.9 MB compressed had downloaded.

Playwright, Chromium, local `python3 -m http.server` (uncompressed, cache
disabled), time from navigation start until a click on "Load a broken sample"
fills the textarea, then until "Check" shows a verdict:

| | handlers live | verdict shown |
|---|---|---|
| before, no throttle | 510 ms | 586 ms |
| after, no throttle | 111 ms | 377 ms |
| before, 1.6 Mbps / 150 ms RTT | 17,769 ms | 17,830 ms |
| after, 1.6 Mbps / 150 ms RTT | 768 ms | 18,082 ms |

The throttled server sends uncompressed files, so the live site's absolute
numbers are smaller (about 0.9 MB rather than 3.3 MB on the wire), but the
ratio holds: the form is live once the HTML is. A visitor who clicks the sample
and "Check" within the first second still waits for the engine, as before;
anyone who reads, types or drops a file first finds it loaded.

## Change

- New `page-engine.mjs` re-exports the eight engine modules' functions.
- The page imports it with `import("./page-engine.mjs")` from `loadEngine()`,
  which "Check" and "Repair" await. Rendering, copy, downloads and the audit pack
  read the loaded module (`engine.`) and are only reachable after a check ran
  (`latest` set), which awaited it.
- The first `pointerdown`, `focusin`, `dragenter` or `keydown` inside the input
  section starts the fetch, so the engine is usually there by the time "Check"
  is clicked. A failed fetch resets the loader so the next click retries.
- The build's module preloads (`platform/pages/preload.mjs`) list only static
  imports, so the engine is no longer preloaded with the page (it was capped at
  80 of the 117). The Pages link check already follows literal `import()`
  specifiers (`platform/pages/check.mjs`, `DYNAMIC_IMPORT_RE`).

## Verification

- Same answers: the rendered verdict, metrics and findings HTML hash the same on
  the old and new page (sha1 prefix `3157e38ce9`, both throttled and not). Repair
  on the broken sample gives the same log, a PASS on the re-check, and the same
  193-byte Markdown download on both pages, with no page errors.
- `page.test.mjs`: the repair test now checks that the page imports
  `page-engine.mjs` and that it re-exports the four repair modules; a new test
  pins the page's static imports to the three light modules and checks that
  every name the page calls through `engine.` or destructures from
  `loadEngine()` is a function `page-engine.mjs` exports.
- `python3 platform/ci/run_venture_tests.py einvoice-preflight`: see the run
  record.

## Not changed, ranked for the next run

1. **The same pattern on other tool pages.** Any page whose inline module
   statically imports a large engine pays it before its buttons work. A sweep:
   for each venture `index.html`, walk the static graph and list pages over
   ~200 kB gzip. Fix only where handlers would otherwise wait.
2. **Split the engine further.** `report.mjs` imports every jurisdiction's
   checks; a JSON invoice never needs the Mexican postal catalogue. Lazy
   per-format loading would cut the first check's wait, but `preflightDocuments`
   is synchronous in places, so it is a bigger refactor with a same-output test.
3. P063 and P064 remain owner-gated (workflow files).
