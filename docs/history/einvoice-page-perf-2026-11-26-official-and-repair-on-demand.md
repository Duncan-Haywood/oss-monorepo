# einvoice-preflight: the official-Schematron bridge and Repair load only when used (2026-11-26)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4).
No agent-workable `perf:` backlog item (P063, P064, P086 are owner rows).
einvoice-preflight is row 1 of `portfolio/monetization/transition.py` and the
public side of bet 3 in `portfolio/monetization/bets.md`. Its test suite is
not the lever: `suite_file_times.py einvoice-preflight --jobs 4` summed 42.5 s
over 278 files (11.4 s wall), the slowest file 1.2 s. So this run took item 1
of the "not changed" list in
`einvoice-page-perf-2026-11-25-national-checkers-on-demand.md`.

## Reading

A static-import walker over `page-engine.mjs` (level-6 gzip per module):
the engine was 83 modules, 360 kB. Exclusive to `official.mjs` (with
`official-browser.mjs` and the three Schematron helpers) and the four repair
modules: 9 modules, 51 kB. The page uses them only when the "official
Schematron" or "Peppol BIS 3.1.0" box is ticked, or on "Repair"; a plain
"Check" never calls them. The one thing a plain check did need from
`official.mjs` is `officialNote`, a pure function, and only once
`addOfficialFindings` has run.

## Change

- New `official-note.mjs`, no imports: `officialNote` moved verbatim;
  `official.mjs` re-exports it, so its tests and other imports are unchanged.
- `page-engine.mjs` keeps every name it exported, but `addOfficialFindings`,
  `repairInvoice`, `repairUbl`, `repairCii` and `repairFacturX` are now async
  wrappers that `import()` their module on first use (a failed fetch clears
  the cache, so the next click retries). Two new exports: `warmOfficial`
  and `repairsReady`.
- `index.html`: ticking either official box starts `warmOfficial()`; the
  Repair handler awaits `repairsReady()` before its `try`, so a network
  failure is not reported as "could not read this XML", and awaits the
  (formerly sync) repair calls.
- `page-engine-split.test.mjs` pins it: none of the six modules is statically
  reachable from `page-engine.mjs`; `official-note.mjs` imports nothing and is
  the same function object through all three paths; every JSON, XML and PDF in
  `examples/` gives a deep-equal result (or the same error) through the
  engine's repair wrappers and the modules directly; `addOfficialFindings`
  through the engine matches `official.mjs`. `page.test.mjs`'s repair test now
  checks for the `import("./repair*.mjs")` calls instead of `from` lines.

## Verification

Suite: `run_venture_tests.py einvoice-preflight`, 2,817 tests pass.

Playwright, Chromium, `platform/perf/revalidate-serve.mjs` (gzip, ETag,
`max-age=0`), the old tree from `git archive HEAD` against the new one, cache
disabled, three fresh contexts each. Load `index.html`, click "Load a passing
example", time from the "Check" click until `#overall` shows the verdict;
bytes and requests from CDP `Network.loadingFinished` after load:

| | transferred | requests | verdict, no throttle | verdict, 1.6 Mbps / 150 ms RTT |
|---|---:|---:|---:|---:|
| before | 383 kB | 83 | 108–128 ms | 3,191–3,214 ms |
| after | 331 kB | 75 | 95–124 ms | 2,953–2,964 ms |

Same behaviour in both trees: "Load a broken example" then "Repair" gives
"Repaired 1 value(s)…" with no page errors; ticking the official box and
checking gives the same "Official Schematron not run…" note (the local tree
has no `./plain/` rules; the Pages build adds them). A visitor who ticks the
official box or presses Repair pays one more round of requests for those
modules, the same bytes as before; the official route already fetches its
rule files after that.

## Not changed, ranked for the next run

1. **`hungary-nav.mjs` (37 kB) and the VERI*FACTU readers**, used in the
   batch pre-pass before the per-file loop (`navInputs`, `vfBatch`); they
   need a sniff-first pre-pass to split.
2. **`facturae.mjs` (33 kB), `fa3.mjs` (19 kB), `fatturapa.mjs` (10 kB)**:
   the 2026-11-25 split again, about 60 kB; most Spanish, Polish or Italian
   visitors would load them anyway.
3. **`auditpack.mjs` (3 kB)**: only the audit-pack button uses it; too small
   to be worth a round trip.
4. The test suite (11 s wall) is not worth a pass.
