# Janitorial Bid Calculator

A free browser calculator for commercial cleaning contractors. It prices a
recurring janitorial contract the way the trade actually bids one — each space
divided by the production rate the crew really hits — and shows the margin
before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/janitorial-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/janitorial-bid-calculator -p 8080
# Run the tests
cd ventures/janitorial-bid-calculator && node --test
```

## The problem it solves

Small cleaning contractors are told to bid by price per square foot. That rule
cannot see the shape of a building. A 8,000 sq ft office that is 600 sq ft of
restrooms spends about a fifth of its labor hours on 7% of its floor area,
because a restroom cleans at roughly 1,200 sq ft per hour and open office at
roughly 4,000. Two buildings of identical size can differ by 30% in labor, and
labor is most of the cost. A per-square-foot bid on the wrong one is a contract
the contractor is locked into for a year at a loss.

The second thing that sinks these bids is payroll burden. A cleaner paid $17
costs more like $22 once employer taxes, workers' compensation (expensive in
this trade), liability insurance, and paid time off are counted. Contractors
who price off the raw wage are short before they start.

## How it works

1. **Per-space labor.** Each row is a space type with its own cleanable square
   footage, production rate (sq ft per cleaner-hour), and cleanings per week.
   Every row can take an optional proposal name (for example two restroom
   rows labelled "2nd floor" and "Lobby"). Unlisted spaces (gym, server room,
   loading dock) use **Other space** and a name the contractor types, so the
   labor split and the copied bid say what is actually being cleaned instead
   of `Area 2`.
   Hours per visit = square feet ÷ production rate. Monthly hours multiply that
   by the weekly frequency and by 52/12 weeks — not 4, which understates the
   month by about 8%, more than the margin on a typical contract. **Other
   space** rows take a custom name so a server room or vacant wing does not
   show up as `Area N`.
2. **Loaded labor.** Hourly wage × (1 + payroll burden %).
3. **Other direct cost.** Supplies per square foot per month, plus equipment,
   travel, anything else billed to the job monthly, and **periodic services**
   (lump cost per occurrence × times per year, averaged into the month). That
   is how quarterly floor care or twice-yearly extraction belongs on a
   recurring contract — not as a production-rate project invoiced once.
4. **Overhead.** A percentage markup on that direct cost — office, admin, and
   sales recovery. It is not applied to itself or to profit.
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a share
   of price, not a markup on cost.
6. **Capacity.** Crew size × available hours per cleaner gives visit capacity;
   utilization and an over-capacity warning make the schedule explicit. This
   checks the night-clean production visit, not day-porter coverage hours.

It then reports the numbers a contractor sanity-checks a bid against: price per
square foot per month, effective hourly billing rate, annual contract value,
the labor split across spaces, and the **walk-away price** — total monthly cost,
below which the job makes nothing. Entering a price already on the table scores
it against the same cost base and says plainly whether it is under water.

**Day-porter / scheduled shifts** are priced as coverage, not extra square
feet. Hours = people × hours per shift × shifts per week × 52/12. A
different wage can be set on a shift when the porter is paid more than the
night crew; an omitted wage uses the contract cleaner rate. Those hours
stay on the monthly contract (they are recurring) but they are not baked
into the night-clean production rate.

**One-time project work** — strip and wax, carpet extraction, an initial deep
clean, post-construction, or a named custom job — is priced with the same
loaded wage, overhead, and margin, then kept off the monthly contract. Hours
are square feet ÷ production rate × coats or passes, plus materials. The
result is a one-time project total and a **first-month invoice** (monthly
service + project work) so the contractor does not amortize a floor job across
eleven months they will never recoup. **Copy bid summary** turns the result
into a plain-text draft with the monthly price, the project lines, the
first-month invoice, and the service areas ready to paste into a proposal.
**Download .txt** saves that same draft locally so it can be attached to a CRM
record or opened in a word processor without retyping the figures.

**If they cut the schedule** answers the renewal question contractors actually
get: a prospect who wants 3×/week instead of 5× and offers 60% of today’s
price. Labor hours scale with the visits; supplies, equipment, and travel in
this model do not. The table shows the reduced-schedule price that still holds
the target margin, the margin left if the linear number is accepted, and a
pasteable reply. If the building-level current week disagrees with the
area-row frequencies (the rows still say 3× while the comparison is 5→3),
labor is rebased onto the building week so the table is not a mix of the
two. A crawlable explainer lives at
[`5x-vs-3x-cleaning-price.html`](5x-vs-3x-cleaning-price.html).

**If they want to buy the paper** answers the other renewal ask: they will
stock paper, soap, and liners if you drop the supplies line. Restroom stock
is only a share of that line — chemicals, finish, and glass stay yours —
and an emergency fill after they run out can price *above* you-supplying.
The table shows you-supply, they-buy-restroom-stock, they-buy-everything,
and they-buy-but-you-still-fill, plus a pasteable reply. A crawlable
explainer lives at
[`should-i-let-them-buy-the-paper.html`](should-i-let-them-buy-the-paper.html).

**If they want the initial thrown in** answers the takeover ask: a neglected
or vacant building wants a deep first visit included in today’s monthly.
That first visit is several regular cleans of labor plus extra chemicals —
a project on a periodic price. The table shows the one-time that still
holds the target margin, the monthly if you bake it in over N months, the
month-1 profit if you throw it in, and the cash if they cancel early. A
crawlable explainer lives at
[`should-i-throw-in-the-initial-clean.html`](should-i-throw-in-the-initial-clean.html).

A flat rate per square foot cannot see a building's own mix of space types —
see [`vs-a-flat-rate-per-square-foot.html`](vs-a-flat-rate-per-square-foot.html)
for a worked example of two identically sized buildings priced apart by
restroom share alone.

A second building is a different question. Open
[`second-site.html`](second-site.html) to price the new site the same way,
then add the drive as loaded labor and extra fuel. The first-building bid
treats the van as already paid for; the hop to the next address is not free.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Production rates

The space types and project types ship with common ballpark rates as a starting
point. **They are not an industry standard, a benchmark, or a guarantee.** Real
rates depend on the crew, the equipment, the layout, soil, finish buildup, and
how much is actually done on each visit. Every rate is editable, and picking a
type never overwrites a rate the contractor has already changed — a rate timed
from their own crew is worth more than any published figure.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `janitorial-bid-usage` — never the building, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `area_added`, `area_removed`,
`proposed_price_compared`, `summary_copied`, `summary_downloaded`, `space_named`,
`shift_added`, `shift_priced`, `shift_removed`,
`project_added`, `project_priced`, `project_removed`,
`frequency_reduction_compared`, `frequency_note_copied`,
`supply_responsibility_compared`, `supply_note_copied`,
`initial_clean_compared`, `initial_clean_offer_compared`,
`initial_clean_note_copied`,
`second_site_compared`, `second_site_offer_compared`,
`second_site_summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- Periodic service plus optional one-time project work (strip and wax,
  extraction, initial/post-construction) invoiced separately from the month.
- Any space row can take an optional proposal name; an empty Other-space
  name still falls back to `Area N`. Catalog types without a typed name keep
  the catalog label.
- Day-porter / attendant shifts are modelled as scheduled coverage on the
  monthly contract. Crew-capacity checks the night-clean production visit
  against cleaners × available hours, not porter coverage.
- Project-work rates and coat counts are starter figures. Real strip, extract,
  and initial-clean times depend on soil, finish buildup, furniture, and access.

## Disclaimer

This free tool is not legal, tax, financial, or business advice, and it does not
tell anyone what to charge. Outputs are arithmetic on the user's own inputs.
Verify every figure against real payroll, insurance, and supply costs and
against a qualified professional before relying on it or submitting a bid. To
the maximum extent permitted by law, the authors accept no liability for loss
or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

MIT licensed — see [`LICENSE`](LICENSE).

## Saving and sharing a bid

The whole form is kept in your own browser as you type, so the bid is still
there on the next visit — the rates you tuned, not the ballpark ones this ships
with. **Start a fresh bid** deletes it.

**Copy bid link** puts the same bid in a URL. Opening it reproduces the bid
exactly, in any browser, with nothing stored server-side — there is no server.
A link beats a saved bid when both exist, because someone opening a link meant
to see that bid; the page says which one is on screen.

A bid link carries your own rates — wage, burden, overhead, and target margin.
Send it to yourself or your crew. The customer should get the price, not the
link.

Nothing is uploaded either way. The rates ride in the link's `#` fragment,
which browsers never send to a server or put in a `Referer` header, so opening
or forwarding a bid link does not leak the numbers off the machines you send it
to. The link is built in the browser and copied by you; the save is
`localStorage` on your own device.

`share.mjs` is the pure encode/decode/store module and is identical in every
bid calculator here. Its field list is passed in from the page rather than kept
in the module, so a field added to the form is saved and shareable without
touching it; `page.test.mjs` fails if the two ever drift apart.
