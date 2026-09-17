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

The static surface includes crawlable `robots.txt` and `sitemap.xml` files so
the calculator can be discovered by search engines and AI assistants when it is
published.

**CLI**, for scripting or batching several quotes into a spreadsheet:

```bash
python3 src/quote_margin.py examples/website-redesign.json --format markdown
# Import the same result into a spreadsheet
python3 src/quote_margin.py examples/website-redesign.json --format csv > quote-review.csv
# Compare every proposal JSON in a folder
python3 src/quote_margin.py proposals/ --batch --format csv > quote-comparison.csv
# Which of those quotes stop clearing the target if the work runs long?
python3 src/quote_margin.py proposals/ --batch --format json > quote-review.json
```

The report distinguishes the customer's inputs from derived arithmetic. It does
not recommend prices, provide tax or financial advice, or claim that a quote is
profitable. The customer decides what costs and target rate are appropriate.

The `Break-even price` line is the same cash as direct costs: the quoted price that covers overhead and subcontractors with nothing left for labor. The `After direct costs` line makes the amount left before the user's own
compensation visible, while `Gap to target price` compares the quote with the
supplied target rate. Both are arithmetic signals, not a profitability verdict.
The CSV format emits stable `measure,value,unit` columns with spreadsheet-safe
escaping for currency labels containing commas, quotes, or line breaks, so you
can append results from several proposals to a spreadsheet without retyping
calculations. The browser Copy / Download buttons emit the same columns plus
the time-overrun, cost-rise, discount-ask, and kill-fee rows already on the
page. `time_buffer_percent` and `buffered_hours` are exported alongside
`buffered_target_price` so the buffered figures stay reproducible from the file
itself, and the Markdown review lists the time buffer with the other supplied
inputs. The browser can also copy a share link that keeps quote figures in the URL
fragment (not sent as a referrer) and a plain-text review summary for an email or
proposal note. It includes the quote's arithmetic, the supplied target
comparison, the local next-step prompt (send / revise / hold remains yours),
and only attention-level review observations. Copying the summary
records an anonymous `review_summary_copied` event locally; quote values are
never stored in that event or sent anywhere. The discount-ask table also has
its own **Copy discount ladder** control for a spreadsheet-safe CSV of the
percent-off rows; that records `discount_ladder_copied` the same way. The browser can also remember
the current worksheet in local storage on this device. Restoring or resetting
that draft records anonymous `draft_restored` / `draft_reset` events; quote
values stay in the browser. The browser can also download those same quote
inputs as a small JSON draft and open that file later or on another device.
Draft files contain only the entered quote fields, are validated before use,
and are never uploaded. Downloading or opening a file records anonymous
`draft_exported` / `draft_imported` events locally.
Batch CSV emits one comparison row per filename, making a folder of recurring
proposal reviews easy to sort and filter without exposing the proposal data.

### The what-if tables in the CLI

Time overrun, direct-cost rises, discount asks, the price ladder, and fixed
vs hourly used to be browser-only: a folder of quotes checked from a script
got a strictly smaller answer than one quote typed into the page. All five
now appear in every CLI format, computed by the same arithmetic as
`site/calc.mjs` (`tests/test_quote_margin.py` runs both implementations on
one quote and compares every field, so the two surfaces cannot drift apart).

- `--format markdown` adds a section per table, each stating what it holds
  fixed.
- `--format json` adds `overrun_scenarios`, `direct_cost_spikes`,
  `discount_asks`, `target_rate_ladder`, and `billing_models`, plus
  `survives_overrun_percent`. `--batch --format json` includes them per quote.
- `--format csv` adds `measure,value,unit` rows for the overrun and cost-rise
  breakpoints.

`survives_overrun_percent` is the largest listed overrun (10, 25, or 50) at
which the quote still reaches the supplied target. `0` means only the planned
hours hold; an empty value means the quote is already below target at planned
hours, where running long is not what went wrong. Batch CSV carries it and
`gap_to_target_at_plus_25_percent_hours` as columns, so a folder of quotes can
be sorted by which ones stop clearing the target first if the work runs long.

Every one of these is arithmetic on the supplied inputs. None is a forecast of
delivery time, of costs, or of what a client will accept, and none is a
recommendation about what to charge.
When a quote clears the supplied target, `discount_room` shows the arithmetic
amount by which the quote could be reduced before reaching that target. A zero
value means the quote is already at or below target; it is a boundary check, not
a recommendation to discount. `minimum_price_adjustment` is the complementary
raise: how much the quoted price would need to increase to reach the supplied
target. It is zero when the quote is already at or above target.

The browser also shows a small pre-send review: arithmetic observations for
direct costs above the price, a gap below the supplied target, hidden time, and
quotes with no revision hours. These are prompts to review your own assumptions,
not a profitability verdict or pricing advice. After that review, three
buttons let you record send, revise, or hold locally — a workflow note, not a
recommendation.

When hidden time reaches at least 25% of the supplied total, the pre-send review
asks you to confirm the scope and revision limit. This is a prompt about your
inputs, not a recommendation or a profitability determination. The result also
shows the time mix: delivery hours versus admin and revision hours.

You can also supply a time-buffer percentage. The browser shows the price that
would correspond to your target hourly rate if planned hours grew by that
percentage. This is a reserve calculation, not a recommendation or forecast.

It also shows +10%, +25%, and +50% time-overrun scenarios. These keep the
quoted price and direct costs fixed while showing how the effective hourly rate
and gap to the supplied target change. They are arithmetic what-if comparisons,
not a forecast of project delivery time.

The browser includes editable starting points for website projects, brand
identity work, and consulting engagements. Presets are examples only and never
replace the user's own scope, cost, or rate assumptions.

The price ladder compares the quote needed at 50, 75, 100, and 125 per hour,
using the supplied hours and direct costs. It is a quick way to compare
negotiation anchors without changing the quote inputs; it is arithmetic only,
not pricing advice.

The target-rate hours budget is the same leftover cash divided by the supplied
target rate: how many total hours the quoted price can absorb after direct
costs. It is a named figure, not a recommendation to add or cut scope.

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

A fourth table puts the same hours and direct costs next to hourly at
the supplied target rate. Planned hours answers whether the fixed
quote is already a discount versus hourly; extra-time rows show how
the two bills diverge when the work runs long. See
[`site/should-i-send-a-fixed-quote-or-bill-hourly.html`](site/should-i-send-a-fixed-quote-or-bill-hourly.html).
The table is arithmetic on the figures you typed, not a
recommendation of which to send.

A short guide,
[`site/effective-hourly-rate.html`](site/effective-hourly-rate.html),
walks the leftover-rate arithmetic (hours, direct costs, target price)
for people who want the method before they change the worksheet.

A fifth table is the mid-project cancel. Hours already spent, cash
already collected, a kill fee on top of that, and costs already sunk
stay as you typed them. It shows cash kept if you finish, take the
fee, or walk with only the deposit — then the same three paths if
freed hours could be rebooked at the supplied target rate. See
[`site/should-i-take-this-kill-fee-or-finish.html`](site/should-i-take-this-kill-fee-or-finish.html).
The table is arithmetic on the figures you typed, not advice to
cancel or finish, and not a forecast of other work.

The browser can save up to 12 review snapshots locally so recurring
proposals can be compared without retyping them. Saved snapshots contain
only calculator fields and derived numbers, never project names, client
content, or identifiers. They can be deleted individually or cleared
together.

Use **Download JSON report** to save the current quote inputs and derived
result as a portable local artifact. The download contains no hidden
browser data and does not upload anything.

The browser can also copy or download a complete Markdown review. It
includes the supplied inputs, derived arithmetic, pre-send observations,
and the time-overrun table so you can retain or share a readable handoff
without retyping the figures. The file stays on this device.

The browser also breaks the target price into delivery labor, hidden admin and
revision time, and direct costs. This makes the arithmetic auditable instead
of leaving the user to reverse-engineer one total; it is not a recommendation
about what to charge.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** Hosted copies of this calculator are free,
experimental, and may be slow, broken, moved, or taken offline without notice.

Only aggregate `report_generated`, `quote_review_checked`, `csv_copied`,
`csv_downloaded`, and `share_link_copied` events are optionally appended to the usage log. Inputs,
project names, prices, and file contents never leave the machine.
Pass `--usage-log PATH` to opt in; omit it to keep usage counting off. The
browser version counts the same event locally in `localStorage` (on by
default, off-switchable in the page footer, and honors Do Not Track/Global
Privacy Control) — see [`site/usage.mjs`](site/usage.mjs); nothing is sent
anywhere in either case. One `report_generated` means one *settled* quote: the
page recomputes on every keystroke, so the counter waits for the figures to
stop changing, skips the pre-filled example on first load, and ignores a repeat
of a quote it already counted. Reading it as "reports", not "keystrokes", is
what makes it comparable to the CLI's own count. The per-table events are
paired to that same settled count rather than recorded as the tables render,
so one settled quote logs one `quote_review_checked`, one
`cost_spike_compared`, one `discount_ask_compared`, and one
`billing_model_compared` — plus one `kill_fee_compared` when the mid-project
cancel inputs also parsed. Recorded per render they would have counted
keystrokes, leaving them incomparable both to `report_generated` and to the
CLI. After the review, the page offers three user-controlled workflow
choices (send, revise, or hold) and counts the selected `quote_decision_*`
event locally when the visitor clicks one. The
browser also counts `history_saved`, `history_deleted`, and `history_cleared`
when local review snapshots are stored or removed, and `history_loaded` when a
saved review's figures are restored into the form (each saved review has its
own **Load** control alongside **Delete**, so a recurring proposal can be
brought back for a re-check without retyping every field). A `report_downloaded`
event is counted when the JSON report is saved locally. CSV copy
and download events happen only when the user invokes those actions. Copying
the review summary records `review_summary_copied` the same way. That
copied note includes total working hours, the admin/revision (hidden)
hours, and the same +10% / +25% / +50% time-overrun rows the page
shows, so a proposal thread can see the time mix and overrun arithmetic
without opening the calculator. Downloading
that same plain-text note as `quote-margin-review.txt` records
`review_summary_downloaded`. Restoring
or resetting a local draft records `draft_restored` or `draft_reset`. The
export contains the same arithmetic report as the page and quotes currency
labels safely for spreadsheet import. These events contain no quote values
and are never uploaded.

## Input

Required non-negative numbers are `price`, `delivery_hours`, and `target_hourly_rate`.
Optional numbers are `admin_hours`, `revision_hours`, `overhead`,
`subcontractor_cost`, and `time_buffer_percent`. The calculator treats all
monetary values as the same currency supplied by the user.

`time_buffer_percent` pads the planned hours for work with a history of running
long, and reports what the quote would have to be to still hit the target rate
at those padded hours (`buffered_hours`, `buffered_target_price`). It defaults
to `0`, where it changes nothing: buffered hours equal planned hours and the
buffered target price equals the target price, so a quote file written before
this field existed scores exactly as it did.

## The browser and the CLI are checked against each other

The venture ships the same arithmetic twice — `src/quote_margin.py` for the CLI
and `site/calc.mjs` for the browser page — so the two can drift. Every other
test pins one side against numbers written into the test by hand, which is a
check that the implementation still does what it did the day the test was
written, not that the two implementations agree.

`site/parity.test.mjs` closes that: it runs the real CLI over every committed
example plus four awkward quotes (one that misses its target, one with no
optional costs, one with room to discount, one whose currency label contains a
comma and quotes) and requires the browser port to reproduce the CLI's JSON
payload exactly — inputs, the headline result, and all five sensitivity tables.
Doubles are compared exactly rather than with a tolerance; rounding for display
is the formatter's job.

Adding it found the drift that prompted it. The browser had offered a time
buffer since it shipped and the CLI had never had the field at all, so anyone
scoring a folder of quotes from a script got a strictly smaller answer than
someone typing the same quote into the page. `time_buffer_percent` above is
that gap closed.
