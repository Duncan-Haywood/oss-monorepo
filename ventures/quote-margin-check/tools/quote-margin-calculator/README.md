# Quote Margin Calculator

What does that fixed-price quote actually pay you per hour? Enter the price,
the hours the job will really take (delivery *plus* the admin and revision
time most estimates skip), and the costs that come out of the same
price — overhead and subcontractors — and the page reports your effective
hourly rate against your own target rate.

The browser front end for [Quote Margin Check](../../README.md), whose target
users are freelancers and small agencies rather than people who run Python
scripts.

## Use it

Open [`index.html`](index.html) in a browser — it is a static page with no
build step and no server. To try it locally:

```sh
cd ventures/quote-margin-check/tools/quote-margin-calculator
python3 -m http.server 8000
# open http://localhost:8000
```

The form loads prefilled with the CLI's own worked example, so there is a
real result on screen before you type anything.

## What it answers

- "I quoted 2,400 for 24 hours of design work — what am I really earning?"
  → 35 hours once 5 admin and 6 revision hours are counted, 480 in direct
  costs, so **54.86/hour**, not the 100/hour the price implied.
- "What would I have to charge to actually hit 75/hour?" → the target price
  row, and the gap between it and your quote.
- "How much is left before I pay myself?" → left after direct costs.

## Relationship to the CLI

[`calc.mjs`](calc.mjs) mirrors `load_quote()` / `calculate()` in
[`../../src/quote_margin.py`](../../src/quote_margin.py) field-for-field —
same validation rules, same formulas, same measure names.

That mirroring is enforced rather than assumed: `calc.test.mjs` shells out to
the real Python CLI over the venture's committed example and requires the
browser tool's CSV export to be **byte-identical** to the CLI's
`--format csv` output. If either side's formula, rounding, or naming changes
without the other, the test fails.

```sh
node --test    # 13 tests: calculator, CLI parity, and usage counting
```

## Privacy

Everything runs in your browser. Prices, hours, and client figures are never
uploaded — there are no accounts, no tracking cookies, no analytics vendor,
and no server to send them to. The page counts anonymous local feature-use
events (`report_generated`, `csv_copied`) in your own browser's
`localStorage` so the maintainers can tell whether the tool is used at all;
it never leaves your device, honours Do Not Track and Global Privacy Control
automatically, and there is a visible off switch in the page footer.

## Disclaimer

Provided free and as-is, without warranty of any kind. It is not tax,
financial, or business advice and does not replace a qualified professional.
You are responsible for reviewing and verifying its output before relying on
it. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

MIT licensed — see [LICENSE](LICENSE).
