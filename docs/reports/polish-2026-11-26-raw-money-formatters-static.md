# Polish 2026-11-26: raw money formatters in front-door source (169 -> 0) + static check

Track: polish/0. Item 2 of "Still weakest" in
`polish-2026-11-26-unseparated-money-all-industries.md`: the phone probe sees
only what a page prints at its defaults, so front-door tools that format
money as `` `$${x.toFixed(2)}` `` still print `$1250.00` the first time a
visitor types a bigger job than the example. A static grep catches them all.

## Measured (`node platform/pages/raw-money-format.mjs`)

| | front-door tools (204) | files |
|---|---|---|
| before (`origin/main` 53ca09aba) | 169 formatters | 75 |
| after | **0** | 0 |

The rest of `ventures/` (`--all`) still has 660 in 227 files, none of them
front doors.

By paid product, before: online sellers 148, construction 22 (fence,
garage door, ice dam, mini-split, solar PV, HVAC maintenance, job margin
variance, appliance repair), manufacturing 1, nonprofits 1. The biggest
single shape was the vendored `money()` whose body is
`` return `${sign}$${Math.abs(value).toFixed(2)}` `` (72 copies, mostly the
eBay, Walmart, Faire and TikTok Shop decision pages).

## What changed

- 169 interpolations in 75 files (18 scripts, 57 pages) now use
  `toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
  (`toFixed(0)` becomes `{ maximumFractionDigits: 0 }`). Only the
  formatting call changed; every expression is otherwise byte-identical.
  Both round half-up on the double's exact value, so amounts under $1,000
  print as before.
- Skipped on purpose: the sample CSV row in amazon-ppc-search-term-analyzer
  (`out.push([`), which mimics Amazon's own export for the parser.
- New `platform/pages/raw-money-format.mjs` and `.test.mjs`: fail on any
  `$`, `£` or `€` before an interpolated `.toFixed(n)` in a front-door
  tool's source (lines with `raw-amount-ok` or an array-row push are
  exempt). Runs with `node --test 'platform/pages/*.test.mjs'`. README
  paragraph under "Probing the paid bets' front doors on a phone".

## Verification

- `python3 platform/ci/run_venture_tests.py --changed`: 47 suites, 0 failed
  (plus the site page checks it picks).
- `node --test platform/pages/raw-money-format.test.mjs`: 3/3.
- Every inline `<script>` in the 57 changed pages extracted and
  `node --check`ed: all parse.
- `check_money_sign.py`, `check_negative_zero_money.py`: clean.

## Still weakest, next

1. Carried: the sideways swipes (`polish-2026-11-26-phone-probe.md`, item 1),
   widest first: whatnot-sales-report-analyzer's `#report` tables (~800px in
   288px), window-design-pressure-calculator's report, walmart decision pages.
2. 660 raw formatters remain outside the front doors. Free tools are demoted
   (`goals.md`), so fix one only when it becomes a door; mapping a tool in
   `front-doors-map.mjs` now makes this test demand it.
3. Carried: change-order-margin-calculator has no "load example" button, so
   the probe measures it only at load.
