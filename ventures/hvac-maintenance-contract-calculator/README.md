# HVAC Maintenance Contract Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hvac-maintenance-contract-calculator/>

A free, local-first browser calculator for independent HVAC contractors who
need to price a preventive-maintenance agreement without losing money on
scheduled visits, callbacks, parts reserve, travel, or overhead.

Open [`index.html`](index.html) directly or serve this directory as static
files. There is no build step, account, upload, network call, paid API, or
payment flow. The calculator is ready for a future static deployment, but is
not publicly published by this repository.

## The problem it solves

An HVAC service call has a visible price. A maintenance agreement hides the
cost in a year of scheduled technician hours, travel, consumables, and callback
risk. A contractor who quotes a monthly number from memory can agree to a plan
that looks like recurring revenue but pays less than the technician time it
consumes.

This tool turns those inputs into a recommended monthly price, annual contract
value, break-even floor, annual technician hours reserved, and effective revenue
per technician hour. An optional proposed price shows whether a customer's
budget is below break-even and produces a copyable plain-text summary.

**After using this, you can now** quote and sanity-check a recurring HVAC
maintenance plan, which used to take a custom spreadsheet and a guess about
callback exposure.

## Opportunity assessment

This is distinct from the portfolio's janitorial, landscaping, roofing, and
generic quote-margin tools. Those tools price cleaning contracts, one-off trade
bids, or general project scope. This calculator targets HVAC contractors'
recurring agreement economics, especially the reserve for callbacks and parts.
Likely search language includes `HVAC maintenance contract pricing`, `preventive
maintenance agreement price`, and `HVAC service contract break even`.

The narrow audience has a measurable pain: one underpriced agreement can consume
many technician hours over a year. Existing field-service suites can invoice a
plan after a contractor has chosen its price; they do not provide a neutral,
local-first way to reason through the price before a quote. A future business
model could be a paid hosted plan or optional export/integration tier, but the
current product is fully free and does not collect payment.

## Privacy and usage

Everything runs in your browser. Your figures are never uploaded, and there are
no accounts, cookies, or analytics vendors. The app stores only aggregate event
counts and the current day in local storage under `hvac-maintenance-usage`; it
never stores equipment, customer, or pricing inputs. Events are
`plan_calculated` and `summary_copied`. Counting is skipped when Do Not Track or
Global Privacy Control is enabled. This is an opt-out local counter, not a
people-tracking system.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial or engineering advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

The calculator is arithmetic on the contractor's own assumptions. It is not a
guarantee of costs, margins, equipment performance, or contract profitability.
Verify labor, vehicle, parts, insurance, tax, and local requirements before
using or publishing a price.

## Test

```bash
node --test calc.test.mjs
```

MIT licensed; see [`LICENSE`](LICENSE).
