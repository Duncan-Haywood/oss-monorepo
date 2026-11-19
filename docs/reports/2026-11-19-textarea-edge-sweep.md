---
kind: note
date: 2026-11-19
---
# The browser sweeps were testing pages whose code never ran

For any run that uses the `platform/ci/check_*.js` browser sweeps.

## What was wrong

Five sweeps (`check_page_runtime.js`, `check_input_edges.js`,
`check_blank_inputs.js`, `check_select_keys.js`, `check_button_clicks.js`)
opened venture pages as `file://`. 1,384 of the 1,408 venture `index.html`
pages load their code with `<script type="module">`, and Chromium blocks
module scripts from `file://` (CORS, origin "null"). So the sweeps mostly
checked pages whose code never ran. The symptom: the first textarea sweep
clicked a run button on 609 pages and only 4 pages changed.

The fix is `platform/ci/sweep_server.js`, a static server on 127.0.0.1 with a
free port. All six sweeps now go through it. With it, 642 of the 776 textarea
pages react. `SWEEP_ROOT=ventures/<slug>` sweeps a single venture.

**Treat any "clean" result from these sweeps dated before 2026-11-19 as
unverified.** The explore prompt's list of clean sweeps covers different
checks (the static `check_*.py` ones), which this does not affect.

## Full runs over http, 2026-11-19

| sweep | pages acted on | hits | real |
|---|---|---|---|
| check_textarea_edges.js (new) | 776 with textareas | 3 | 2 (same bug in 2 tools) |
| check_page_runtime.js | 1,407 | 4 | 0 (all prose: "undefined when m is 0") |
| check_input_edges.js | 1,202 with inputs | 5 | 4 |
| check_blank_inputs.js | 1,372 with inputs | 6 | 4 (same as input_edges) + 1 artifact |
| check_select_keys.js | 1,304, 26,101 actions | 2 | 2 (same bug in 2 tools) |
| check_button_clicks.js | 1,382, 6,197 clicks | 9 | 4 |

Fixed in this PR:

- appointment-no-show-analyzer, service-hourly-yield-analyzer: **every file
  threw "table is not iterable", the sample included**, from PR #15815
  (2026-11-14) until now. `detectDecimalComma` looped over `parseCsv`'s
  `{ rows, lines }` object. The other 28 tools that make the same call have
  array-returning parsers (checked one by one). Test:
  `decimal-comma-pipeline.test.mjs` (fails 0/3 without the fix).
- facebook-marketplace-fee-calculator: Copy link called `readAllInputs()`,
  which does not exist (should be `readInput()`).
- mobile-oil-change-route-profit-calculator: the Franchise column read
  `x.agency` and showed $NaN on every row.
- uk-inheritance-tax-calculator: a stray "Same price as a first-time buyer"
  row (`r.ftbTax`, copied from a stamp-duty page) showed £NaN on every report.
- vsme-report-builder: legal form, NACE, country, emission factor source and
  pollution are text, but went through the number formatter and printed NaN.
- electrical-panel-upgrade-bid-calculator, septic-pumping-bid-calculator:
  rate-suggestion `change` handlers threw uncaught on a blank size.
- locksmith-bid-calculator: "must be at least -Infinity."
- reverb-fee-calculator: "NaN% of the $0.00 sale price".
- au- and nz-gst-registration-checker: a blank year labelled the months
  "undefined -1".

Not bugs:

- agent-workroom: the sweep's synthetic `keyup` has no `key`.
- the clipboard write denials in clothing-design-studio, git-timesheet and
  job-margin-variance: headless Chromium has no clipboard permission.
- quickbooks-iif-file-check: "an undefined account" is finding text. The
  textarea sweep strips `(an|the) undefined`.
- import-landed-cost-calculator: "undefined at zero" is prose.

## Seedless reduce, statically

I scanned for `.reduce(fn)` with no initial value, which throws on an empty
array. It found 204 calls (99 after skipping eval/, constants and
literal arrays). Every one I read was guarded upstream (a `.length` check, a
"no rows" early return, a fixed list of options), so I did not write a lint.
The textarea sweep tests the behaviour instead.

## Next

- Wire the sweeps into the nightly `browser-checks-ci.yml`. That is a
  control-plane (`.github/`) edit, so it needs its own small PR.
- `check_button_clicks.js` with `FILL=0`, `FILL=blank` and `FILL=-1` over
  http: done, 11 ventures fixed (`2026-11-19-button-click-fill-sweeps.md`).
