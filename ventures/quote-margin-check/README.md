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

Only aggregate `report_generated` events are optionally appended to the usage
log. Inputs, project names, prices, and file contents never leave the machine.

## Input

Required non-negative numbers are `price`, `delivery_hours`, and `target_hourly_rate`.
Optional numbers are `admin_hours`, `revision_hours`, `overhead`, and
`subcontractor_cost`. The calculator treats all monetary values as the same
currency supplied by the user.
