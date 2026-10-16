# Parking Lot Striping Bid Calculator

A free browser calculator for parking-lot striping and pavement-marking
contractors. It prices a lot the way the trade actually loses money — stall
lines, ADA hash aisles, arrows, coats, and new-layout hours — and shows the
margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/parking-lot-striping-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is to GitHub Pages.

```bash
# Serve it locally
npx --yes serve ventures/parking-lot-striping-bid-calculator -l 8080
# Run the tests
cd ventures/parking-lot-striping-bid-calculator && node --test
```

After using this, you can now **price a restriped 50-stall lot and a new-layout
ADA-heavy lot as different jobs**, which used to take a per-stall guess that
treated them as the same number.

## The problem it solves

Property managers ask "how much to stripe a parking lot" and get quoted $8 a
stall or $400 for fifty spaces. That rule cannot see the shape of the marking.
A 50-stall retail restripe with faded 4-inch lines is mostly paint and a short
crew day. The same stall count with six ADA stalls, hashed access aisles,
arrows, a fire lane, two coats, and a new string-line layout is a different
job. Two lots of identical stall count can differ by more than 2× in paint and
labor, and paint plus labor is most of the cost. Matching the cheap special on
the second one is a Saturday the contractor works at a loss.

The second thing that sinks these bids is treating a second coat as either
"free" or "another full job." A second coat is almost another paint ticket —
the setup day is already paid.

Search phrases this page is built for: *how much to charge to stripe a parking
lot*, *parking lot striping cost calculator*, *pavement marking bid
calculator*, *how much to charge for parking lot line striping*.

Distinct from sealcoat (coats and cracks), asphalt paving (tons of mix), gravel
driveway (trucks and depth), and concrete pours (cubic yards of slab). This
prices painted pavement marking.

## How it works

1. **Stall lines.** Standard + ADA stalls × lineal feet of 4-inch line per
   stall (starting point: 18 ft, because adjacent 90-degree stalls share a
   side).
2. **ADA extra.** Each ADA stall adds hashed access-aisle line, extra crew
   time, a stencil, and a sign — the line a per-stall special never sees.
3. **Stencils and extras.** Arrows, stop bars, crosswalks, fire-lane footage,
   and curb paint are their own hours and gallons.
4. **Coats.** Paint gallons multiply by coats. Second-coat labor defaults to
   0.7 of first-coat paint labor, not another setup day.
5. **Layout.** A new layout adds string-line hours per stall that a restripe
   does not.
6. **Loaded labor, overhead, margin.** Wage × (1 + burden %), then overhead on
   direct cost, then price = cost ÷ (1 − target margin %).

It then reports the numbers a contractor sanity-checks a bid against: price per
stall, price per lineal foot, effective hourly billing rate, gallons, the
labor split, and the **walk-away price** — total cost, below which the job
makes nothing. **Compare layout**, **compare ADA as regular stalls**, and
**compare coats** show where the cheap special loses. **Copy bid summary**
turns the result into a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

Coverage (lineal feet per gallon, square feet per gallon) and hour rates ship
as common ballpark figures. **They are not an industry standard, a MUTCD
requirement, a benchmark, or a guarantee.** Real yield depends on paint,
surface, temperature, and mil thickness. Every rate is editable.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `parking-lot-striping-bid-usage` — never the lot,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `layout_compared`, `ada_compared`,
`coats_compared`, `proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax or permit-fee handling.
- 4-inch waterborne traffic paint as the default; thermoplastic, tape, and
  epoxy markings are not a separate material model yet.
- Stall geometry is an editable lineal-foot factor, not a CAD layout.
- Not an ADA, MUTCD, or traffic-engineering determination.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, engineering,
traffic-engineering, or ADA advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your inputs
and run it yourself.

MIT licensed — see [`LICENSE`](LICENSE). Support via the
[project on GitHub](https://github.com/Duncan-Haywood/monorepo-projects) is
entirely optional and never changes what the tool does.

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
