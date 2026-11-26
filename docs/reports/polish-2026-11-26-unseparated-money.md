---
kind: polish
topics: [design]
date: 2026-11-26
---
# Polish 2026-11-26: thousands separators across the construction front doors

Track: polish/0. Item 1 of "Still weakest" in
`polish-2026-11-26-retainage-cards-and-money.md`: the `$12345.67` prose habit
fixed in retainage probably exists in other construction front doors to the
pay-app bet (`portfolio/monetization/bets.md`, bet 1), and a page check should
stop it coming back.

## The check

`platform/pages/phone-probe.mjs` gains a fifth rule: a money amount printed
without thousands separators (`RAW_AMOUNT_RE`: `$`, `£` or `€`, then 4+ digits
with no comma). It reads visible text (not `code`/`pre`) and the values of
textareas and `<output>`s, since a summary or follow-up draft in a textarea is
exactly what a contractor copies into an email. Opt-out:
`data-raw-amount-ok`. Two new tests (`phone-probe.test.mjs`, 10 pass).

## Measured (`phone-probe-check.mjs`, 131 construction slugs, 495 pages, 390 × 844)

| page | before (`origin/main` 13b1694de) | after |
|---|---|---|
| construction-delay-claim-calculator/ (advice, example worked) | 7 raw amounts (`$24000.00`, `$61500.00`, …) | 0 |
| scope-creep-change-order-calculator/ (change-order markdown) | 3 (`$2100.00`, `$6000.00`, `$8100.00`) | 0 |
| certified-payroll-calculator/wh347-report.html (advice) | 2 (`$3731.50`, `$2804.70`) | 0 |
| home-elevator-bid-calculator/ (price per stop) | 1 (`$14054`) | 0 |
| plantation-shutter-bid-calculator/ (price per opening) | 1 (`$1132.17`) | 0 |
| skylight-install-bid-calculator/ (price per unit) | 1 (`$1379.84`) | 0 |

The probe's other failures (126 sideways swipes on 73 slugs) are unchanged
and already listed in `polish-2026-11-26-phone-probe.md`.

## What changed

- Same template defect in 27 `*-bid-calculator` pages: the per-unit price
  (`pricePerDoor`, `pricePerToilet`, `pricePerSqFt`, …) used
  `` `$${x.toFixed(2)}` `` beside a page `money()` that already separates.
  All 27 now call `money()`. Only three exceeded $1,000 at their defaults, but
  per-door and per-fixture prices do on real jobs.
- change-order-margin-calculator: new exported `formatMoney` in `calc.mjs`;
  the page's results and the copyable summary use it (two pinned test strings
  updated to `$1,350.00`, `$2,277.00`; one new test).
- construction-delay-claim-calculator: `usd()` in `calc.mjs` for the advice
  lines (the CSV keeps raw numbers); new test.
- certified-payroll-calculator: separators in `wh347.mjs` flags and advice and
  `compliance.mjs`.
- scope-creep-change-order-calculator: exported `money()` in `engine.mjs` for
  the markdown, the page summary and the gate message (`cli.test.mjs` pin
  updated to `$1,000.00`).

Tests: all 33 touched venture suites pass (0 failures), plus
`platform/pages/phone-probe.test.mjs`.

## Still weakest, next

1. Run `phone-probe-check.mjs --industry all` once: the rule is new, and the
   130 `calc.mjs` files outside construction that interpolate
   `` `$${x.toFixed(2)}` `` (grep in the note above) almost certainly print
   some. Fix the paid bets' front doors first (einvoice uses `€`).
2. Carried: the 126 swipes (`polish-2026-11-26-phone-probe.md`, item 1), widest
   first; two-column amount grid for pay-application-generator's phone cards.
3. change-order-margin-calculator has no "load example" button, so the probe
   measures it only at load; its summary is covered by `calc.test.mjs`.
