# Quote Margin Check

Quote Margin Check is a free, local-first calculator for freelancers and small
agencies. It turns a proposed price, delivery hours, overhead, subcontractor
costs, and revision buffer into a transparent effective hourly rate and a
target-price comparison.

## Browser calculator

Most freelancers won't run a Python script, so the same math also ships as a
self-contained page: open [`site/index.html`](site/index.html) in a browser, or
serve the `site/` directory statically. Zero dependencies, no build step, no
signup, and nothing is uploaded — there is no server for it to go to. It opens
with a worked example already filled in, so the first number appears without
typing anything, and "Copy as CSV row" produces the same
`measure,value,unit` rows as the CLI's `--format csv`.

[`site/calc.mjs`](site/calc.mjs) mirrors `src/quote_margin.py`'s `load_quote()`
and `calculate()` field-for-field so the two surfaces can't quietly diverge;
`node --test` in `site/` covers the same cases as the Python suite.

Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but it is ready to deploy as-is.

## Command line

For scripting, or batching several proposals into a spreadsheet:

```bash
python3 src/quote_margin.py examples/website-redesign.json --format markdown
# Import the same result into a spreadsheet
python3 src/quote_margin.py examples/website-redesign.json --format csv > quote-review.csv
# Compare every proposal JSON in a folder
python3 src/quote_margin.py proposals/ --batch --format csv > quote-comparison.csv
```

The report distinguishes the customer's inputs from derived arithmetic. It does
not recommend prices, provide tax or financial advice, or claim that a quote is
profitable. The customer decides what costs and target rate are appropriate.

The `After direct costs` line makes the amount left before the user's own
compensation visible, while `Gap to target price` compares the quote with the
supplied target rate. Both are arithmetic signals, not a profitability verdict.
The CSV format emits stable `measure,value,unit` columns so you can append
results from several proposals to a spreadsheet without retyping calculations.
Batch CSV emits one comparison row per filename, making a folder of recurring
proposal reviews easy to sort and filter without exposing the proposal data.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

Only aggregate `report_generated` events are optionally appended to the usage
log. Inputs, project names, prices, and file contents never leave the machine.
Pass `--usage-log PATH` to opt in; omit it to keep usage counting off.

The browser calculator counts the same event locally in `localStorage` — on by
default, switchable off in the page footer, and automatically disabled when the
browser sends Do Not Track or Global Privacy Control. It counts *settled*
reports, not keystrokes: the page re-renders as you type, but an event is
recorded only once the figures stop changing, and a result identical to the one
already counted is never counted twice. See
[`site/usage.mjs`](site/usage.mjs). Nothing is transmitted in either case.

## Input

Required non-negative numbers are `price`, `delivery_hours`, and `target_hourly_rate`.
Optional numbers are `admin_hours`, `revision_hours`, `overhead`, and
`subcontractor_cost`. The calculator treats all monetary values as the same
currency supplied by the user.
