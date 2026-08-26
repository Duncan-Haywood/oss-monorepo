# Quote Margin Check

Quote Margin Check is a free, local-first calculator for freelancers and small
agencies. It turns a proposed price, delivery hours, overhead, subcontractor
costs, and revision buffer into a transparent effective hourly rate and a
target-price comparison.

**Browser calculator** (no install, nothing uploaded): open
[`site/index.html`](site/index.html) directly in a browser, or serve the
`site/` directory statically — it is a self-contained, zero-dependency page
with the same math as the CLI below (see [`site/calc.mjs`](site/calc.mjs)).
Not yet deployed to a public URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md` — but it's ready to deploy as-is.

**CLI**, for scripting or batching several quotes into a spreadsheet:

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
The CSV format emits stable `measure,value,unit` columns with spreadsheet-safe
escaping for currency labels containing commas, quotes, or line breaks, so you
can append results from several proposals to a spreadsheet without retyping
calculations. The browser Copy / Download buttons emit the same columns plus
the time-overrun, cost-rise, discount-ask, and kill-fee rows already on the
page.
Batch CSV emits one comparison row per filename, making a folder of recurring
proposal reviews easy to sort and filter without exposing the proposal data.

The browser also shows a small pre-send review: arithmetic observations for
direct costs above the price, a gap below the supplied target, hidden time, and
quotes with no revision hours. These are prompts to review your own assumptions,
not a profitability verdict or pricing advice.

It also shows +10%, +25%, and +50% time-overrun scenarios. These keep the
quoted price and direct costs fixed while showing how the effective hourly rate
and gap to the supplied target change. They are arithmetic what-if comparisons,
not a forecast of project delivery time.

A second table keeps hours and the quoted price fixed and raises only overhead
plus subcontractor cost by the same +10% / +25% / +50%. That answers the
stale-quote question: if materials or a sub go up after you send a fixed
price, what effective rate is left, and what price would still hit your
target rate. See
[`site/if-costs-go-up-is-this-quote-still-alive.html`](site/if-costs-go-up-is-this-quote-still-alive.html).
The table is arithmetic on the figures you typed, not a forecast of supplier
prices.

A third table keeps hours and direct costs fixed and knocks 5%, 10%, 15%,
and 20% off the quoted price. That answers the “can you do 10%?” email:
what effective rate is left, and how many hours of scope would have to
leave to still hit the supplied target rate. See
[`site/if-they-ask-for-10-percent-off.html`](site/if-they-ask-for-10-percent-off.html).
The table is arithmetic on the figures you typed, not a negotiation
script or a pricing recommendation.

A fourth table is the mid-project cancel. Hours already spent, cash
already collected, a kill fee on top of that, and costs already sunk
stay as you typed them. It shows cash kept if you finish, take the
fee, or walk with only the deposit — then the same three paths if
freed hours could be rebooked at the supplied target rate. See
[`site/should-i-take-this-kill-fee-or-finish.html`](site/should-i-take-this-kill-fee-or-finish.html).
The table is arithmetic on the figures you typed, not advice to
cancel or finish, and not a forecast of other work.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** Hosted copies of this calculator are free,
experimental, and may be slow, broken, moved, or taken offline without notice.

Only aggregate `report_generated`, `quote_review_checked`, `csv_copied`, and
`csv_downloaded` events are optionally appended to the usage log. Inputs,
project names, prices, and file contents never leave the machine.
Pass `--usage-log PATH` to opt in; omit it to keep usage counting off. The
browser version counts the same event locally in `localStorage` (on by
default, off-switchable in the page footer, and honors Do Not Track/Global
Privacy Control) — see [`site/usage.mjs`](site/usage.mjs); nothing is sent
anywhere in either case. One `report_generated` means one *settled* quote: the
page recomputes on every keystroke, so the counter waits for the figures to
stop changing, skips the pre-filled example on first load, and ignores a repeat
of a quote it already counted. Reading it as "reports", not "keystrokes", is
what makes it comparable to the CLI's own count. The browser also counts
`quote_review_checked` locally when a valid quote is reviewed, and
`cost_spike_compared` when the cost-rise table is computed, and
`discount_ask_compared` when the discount-ask table is computed, and
`kill_fee_compared` when the mid-project cancel table is computed. CSV copy
and download events happen only when the user invokes those actions. The
export contains the same arithmetic report as the page and quotes currency
labels safely for spreadsheet import. It stores no quote values and sends
nothing anywhere.

## Input

Required non-negative numbers are `price`, `delivery_hours`, and `target_hourly_rate`.
Optional numbers are `admin_hours`, `revision_hours`, `overhead`, and
`subcontractor_cost`. The calculator treats all monetary values as the same
currency supplied by the user.
