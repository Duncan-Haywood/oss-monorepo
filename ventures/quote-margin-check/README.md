# Quote Margin Check

Quote Margin Check is a free, local-first calculator for freelancers and small
agencies. It turns a proposed price, delivery hours, overhead, subcontractor
costs, and revision buffer into a transparent effective hourly rate and a
target-price comparison.

## Browser tool

Most freelancers won't run a Python script. [`web/index.html`](web/index.html)
is the same math as a zero-dependency, zero-build static page — open it
directly in a browser (or serve the `web/` directory) and fill in the form.
Nothing is uploaded; see its own Privacy section for the local-first usage
counter.

```bash
cd web && python3 -m http.server 8000
# then open http://localhost:8000/
```

The page has no account and no server, so the two things it would otherwise be
unable to do are built in:

- **Copy report (Markdown)** — the same report `--format markdown` prints, ready
  to paste into notes or a client email.
- **Copy link to this quote** — the figures ride in the URL's `#` fragment,
  which browsers never send to a server, so a link is a private bookmark you can
  reopen or send to yourself. Opening one restores the form.

`web/calc.mjs` mirrors `src/quote_margin.py`'s `load_quote()`/`calculate()`
field-for-field so the two can't quietly diverge — `node --test` in `web/`
covers the same cases as the CLI's test suite, and `web/report.test.mjs` asserts
the copied Markdown against the CLI's own output byte for byte rather than
against a fixture that could drift away from it.

## Command line

Prefer scripting several quotes at once, or importing into a spreadsheet:

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

## Input

Required non-negative numbers are `price`, `delivery_hours`, and `target_hourly_rate`.
Optional numbers are `admin_hours`, `revision_hours`, `overhead`, and
`subcontractor_cost`. The calculator treats all monetary values as the same
currency supplied by the user.
