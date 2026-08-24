# Quote Margin Check

Quote Margin Check is a free, local-first calculator for freelancers and small
agencies. Open [`index.html`](index.html) in a browser to turn a proposed
price, delivery hours, overhead, subcontractor costs, and revision buffer into
a transparent effective hourly rate and a target-price comparison. It also
exports a JSON evidence record so a quote can be reviewed before it is sent.

```bash
python3 src/quote_margin.py examples/website-redesign.json --format markdown
# Export rows for a spreadsheet
python3 src/quote_margin.py examples/website-redesign.json --format csv > quote-review.csv
```

The report distinguishes the customer's inputs from derived arithmetic. It does
not recommend prices, provide tax or financial advice, or claim that a quote is
profitable. The customer decides what costs and target rate are appropriate.

Only aggregate feature names and dates are optionally stored in localStorage.
Inputs, project names, prices, and file contents never leave the machine. The
counter is visible and switch-off-able in the page, and honors Do Not Track.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial or business advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

Everything runs in your browser. Your data is never uploaded, and we use no
accounts, tracking cookies, or analytics vendor.
The `After direct costs` line makes the amount left before the user's own
compensation visible, while `Gap to target price` compares the quote with the
supplied target rate. Both are arithmetic signals, not a profitability verdict.

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

An optional short `currency` label defaults to `units`. Required non-negative numbers are `price`, `delivery_hours`, and `target_hourly_rate`.
Optional numbers are `admin_hours`, `revision_hours`, `overhead`, and
`subcontractor_cost`. The calculator treats all monetary values as the same
currency supplied by the user.

After using this, you can compare a quote against the time and cost assumptions
you supplied, including a spreadsheet-ready export, which used to require
rebuilding the calculation by hand.

## Privacy and usage

Everything runs on your machine. Inputs are never uploaded, and there are no
accounts, cookies, or analytics vendors. If `--usage-log` is supplied, the tool
appends only an anonymous `report_generated` timestamp; it never records quote
values or file contents.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.
