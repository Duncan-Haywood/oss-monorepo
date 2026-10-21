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
