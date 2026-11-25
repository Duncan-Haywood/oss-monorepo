# einvoice-preflight: Mexico's and Brazil's checkers load only for their files (2026-11-25)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4).
The three open perf backlog items (P063, P064, P086) are owner-gated, and the
CI list was mined five times today. einvoice-preflight is row 1 of
`portfolio/monetization/transition.py` (subscription), so this run took item 2
of the "not changed" list in
`ci-perf-2026-11-20-einvoice-page-engine-on-demand.md`: split the engine
behind the first "Check".

## Reading

A static-import walker over `page-engine.mjs` (level-6 gzip per module;
for each module, the bytes nothing else in the graph needs):

| exclusive to | gzip |
|---|---:|
| whole engine | 925,703 B, 115 modules |
| `cfdi.mjs` (Mexico: CFDI XSD, postal catalogue, Carta Porte, CCE) | 335,687 B |
| `cfdi.mjs` + `nfe`, `nfe-event`, `nfse`, `abrasf`, `dsf` (Brazil) | 567,521 B |

`report.mjs` imported all six statically, so every check on the page fetched
them, though an EU UBL/CII or JSON invoice reaches none of them.
`preflightDocuments` is already `async`, and each checker is called at one
dispatch point after a cheap `looksLike*` sniff, so no sync path stood in the
way (the 2026-11-20 note guessed it would be "a bigger refactor"; it was not).

## Change

- New `national-sniff.mjs`, no imports: the six `looksLike*` sniffers and the
  constants they need (`NFE_NS`, `NFSE_NS`, the ABRASF own-namespace pattern),
  moved verbatim.
- The six checker modules import and re-export those, so every existing import
  (`brazil-nfe-e-invoice-mandate.html`, the evals, the tests) is unchanged.
- `report.mjs` imports the sniffers from `national-sniff.mjs` and does
  `const { checkCfdi } = await import("./cfdi.mjs")` (and likewise for the five
  Brazilian checkers) inside each format's branch.
- `national-sniff.test.mjs` pins it: none of the six is a static import of
  `report.mjs`, the sniff module imports nothing, each checker re-exports the
  same function object, and a CFDI and an NF-e still reach their checkers.

## Verification

Same answers: every `.xml`/`.json` under the venture under 1 MB (200 files: 14
CFDI, 37 NF-e/NFC-e, 13 NFS-e and the rest EU, Polish, Hungarian, Spanish,
Italian) through `preflightDocuments` in the old tree (`git archive HEAD`) and
the new one, JSON-serialised: `cmp` identical. Suite:
`run_venture_tests.py einvoice-preflight`, 2,794 tests pass (plus the 4 new).

Faster: Playwright, Chromium, `platform/perf/revalidate-serve.mjs` (gzip,
ETag, `max-age=0` like the live site), cache disabled, three fresh contexts
each. Load `index.html`, click "Load a valid sample", time from the "Check"
click until `#overall` shows the verdict; bytes and requests from CDP
`Network.loadingFinished` after load:

| | transferred | requests | verdict, no throttle | verdict, 1.6 Mbps / 150 ms RTT |
|---|---:|---:|---:|---:|
| before | 935 kB | 115 | 237–273 ms | 6,085–6,110 ms |
| after | 374 kB | 83 | 140–147 ms | 3,168–3,248 ms |

The engine starts loading on the first touch of the input section, so on a
real visit part of this overlaps with the visitor choosing a file; the cut
in bytes is the durable number. A Mexican or Brazilian file pays one extra
round of requests for its checker on the first check, the same bytes as
before.

## Not changed, ranked for the next run

1. **`official.mjs` / `official-browser.mjs` (31 kB)** and the four repair
   modules load with the engine though only "Repair" and the official-rules
   toggle use them. Smaller; same pattern from `page-engine.mjs`.
2. **`hungary-nav.mjs` (37 kB) and the VERI*FACTU readers** are used in the
   batch pre-pass before the per-file loop (`navInputs`, `vfBatch`), so they
   need a sniff-first pre-pass to split. Worth it only with item 1.
3. **`facturae.mjs` (33 kB), `fa3.mjs` (19 kB), `fatturapa.mjs` (10 kB)**:
   the same split as here, about 60 kB more; each is the core format of a
   country the product sells to, so most visitors from Spain, Poland or Italy
   would load them anyway.
4. P063, P064, P086 remain owner-gated.
