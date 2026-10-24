# Extending AI Bookkeeper: brief for an agent reader

**Date:** 2026-10-21. **Reader:** an agent about to deepen
[`ventures/ai-bookkeeper`](../../ventures/ai-bookkeeper/README.md) (first in
`portfolio/flagships.yaml`, on the owner's direction "I want to make ai
accounting systems", `prompts/goals.md`).

## Answer

The books are one JSON object (`newBooks()`). Every function in `engine.mjs`
takes it and returns a new copy, and the page, the CLI and
`platform/agents/tools.mjs` all go through those same functions. A line's
`status` is `new | review | auto | confirmed | transfer`. Only `auto`,
`confirmed` and `transfer` reach `journal()`. Every amount is integer cents,
positive for money into the bank or card account; card exports need
`invert`. Add a feature in the engine with a test first, then wire the page.
Re-run `eval/benchmark.mjs` and update the numbers the README, the page, the
guide, `llms.txt` and the post quote. `page.test.mjs` and `engine.test.mjs`
fail if the page, the README and the guide drift from them.

## Where things are

| Need | File |
|---|---|
| A new bank CSV quirk | `bank.mjs` (`ALIASES`, `parseCents`, `parseDate`); add the real file as a fixture |
| A new categorizer signal | `categorize.mjs` (`suggest` layer order; `features` for naive Bayes) |
| Split lines, accruals | `engine.mjs` `journal()` builds two-line entries today; `validateEntry` already handles n lines |
| A close check | `engine.mjs` `closeChecks()`: return `{ severity, check, message, ids }` |
| Model prompt or guard rails | `ai.mjs`; `byok.mjs` is a synced copy of `platform/llm/byok.mjs` (a test fails on drift) |
| Benchmark data | `eval/synth.mjs` (seeded); `eval/gen-example.mjs` regenerates `example-data.mjs` |

## Traps found while building it

- `fmt(cents, currency)` takes a second argument. `array.map(fmt)` passes the
  index as the currency prefix, so `-2,868.05` printed as `02,868.05`. Write
  `.map((v) => fmt(v))`.
- A card statement prints what you owe as a positive balance, while the books
  keep balances debit-positive. `importStatement` tries both signs of the
  printed balance and keeps the one the rows agree with.
- Memory keys on the first two payee tokens. A token with a digit is dropped
  whole, because stripping digits turned `1GH4QE` into the fake token `gh`.
- The synthetic month-1 accuracy is circular: one author wrote the built-in
  keywords and the generator. Quote only the learning numbers, and say so.
- In the generator, payroll tax filed to a liability with no accrual left
  "Payroll liabilities" negative. It is now filed to Taxes and licenses. The
  same pattern on real books, a liability paid below zero, is what the
  `liability` close check reports.

## Limits

No real bank export has been tested, and the AI layer is unmeasured. The page
is checked in headless Chromium (example, filing, reconciliation, a reload, 390px
width, no outside requests), but no person has used it yet.

## Update: split lines (2026-10-21)

`confirm` now also takes an array of `{ account, cents }` parts for a line
(signed like the bank line, summing exactly to it, one `cents` may be omitted
for the remainder). Status `split`; the journal posts the bank leg plus one leg
per part; `parseSplit("4000:1000.00,6010:-30.00")` is the text form the CLI and
page use. Splits skip `history`, so they never train memory. Tests:
`ventures/ai-bookkeeper/engine.test.mjs`, four cases (payout, loan, refusals
and undo, checks and export).

## Update: invoices and bills (2026-10-21)

`analyze` takes `documents: [{ csv }]` (`type,number,date,due,party,amount,account`)
and returns `aging`. A document journals on its own date to receivable (1100) or
payable (2050, added to the chart if missing). A bank line settles one only on
an exact amount, 0 to 180 days after, plus the number or the party name in its
description; an amount alone is a 0.60 suggestion, never a post. Without that
rule a deposit that pays an invoice would count as income twice. Matches are
rebuilt every `categorize` pass, so re-filing a settled line reopens its
document. New close checks: `control` (ledger receivable or payable differs from
the open documents) and `overdue` / `bill-overdue` (over 30 days past due).
Tests: engine.test.mjs, "Accruals". Not measured on a real invoice export.

## Addendum: 1099-NEC worksheet (2026-10-21)

`cli.mjs contractors` and `w9` add a year-end contractor list to the engine: bank
payments filed to Contract labor, totalled by payee, against the 1099-NEC line, with a
W-9-on-file flag. Two choices an agent calling it should know. Card payments are shown
apart and excluded, because the processor reports them on a 1099-K. The W-9 flag keeps
no tax ID, so the books file stays free of the most sensitive field. The threshold
(600 dollars to 2025, 2,000 from 2026) is the author's reading of the 2025 change and is
not checked against the IRS page. Payees group on the first two words of the bank line,
so spelling variants can split one person in two.
