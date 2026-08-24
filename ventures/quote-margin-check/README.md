# Quote Margin Check

Quote Margin Check is a free, local-first calculator for freelancers and small
agencies. It turns a proposed price, delivery hours, overhead, subcontractor
costs, and revision buffer into a transparent effective hourly rate and a
target-price comparison.

```bash
python3 src/quote_margin.py examples/website-redesign.json --format markdown
```

The report distinguishes the customer's inputs from derived arithmetic. It does
not recommend prices, provide tax or financial advice, or claim that a quote is
profitable. The customer decides what costs and target rate are appropriate.

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

Required non-negative numbers are `price`, `delivery_hours`, and `target_hourly_rate`.
Optional numbers are `admin_hours`, `revision_hours`, `overhead`, and
`subcontractor_cost`. The calculator treats all monetary values as the same
currency supplied by the user.
