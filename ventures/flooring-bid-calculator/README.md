# Flooring Bid Calculator

A free browser calculator for flooring installers and small shops. It prices a
residential install the way the job actually costs — purchased material after
waste, tear-out hours that are not the same as install hours, and stairs by
the tread — and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/flooring-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

```bash
# Serve it locally
npx http-server ventures/flooring-bid-calculator -p 8080
# Run the tests
cd ventures/flooring-bid-calculator && node --test
```

## The problem it solves

After using this, you can now see the purchased material, demo hours, and
stair labor on a house before you send a price, which used to take a
spreadsheet that still quoted the finished floor as if every room installed
the same.

Installers are told to bid by dollar per square foot. That rule cannot see
the shape of the job. Waste is extra material you buy — 8% on straight-lay
LVP, 12% or more on a diagonal — and it does not appear on the customer's
floor. Tear-out is a different job from the install: a kitchen of ceramic
tile can take more hours to demo than to lay new plank. Stairs are priced
per tread, not as hallway square footage. Two houses of identical finished
area can differ by a full day of labor, and labor plus wasted material is
most of the cost. A blended $/sq ft on the living-room number is how a job
that looked profitable is not.

## How it works

1. **Per-room install.** Each row is a room with installed square footage, a
   waste percent, and an install rate (sq ft per crew-hour). Purchased
   material = installed × (1 + waste%). Install hours = installed ÷ rate.
2. **Tear-out.** Each room also has a demo rate (hours per 100 sq ft) and a
   disposal cost per installed square foot. Tile and glue-down are the rows
   that sink a "same price as the living room" quote.
3. **Job extras.** Stair treads, transitions, furniture moves, leveling, and
   shoe moulding are priced separately. Thirteen treads at 0.4 hours each
   are 5.2 hours — often as long as the kitchen.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Other direct cost.** Flooring and underlayment on *purchased* square
   footage, plus dump ticket, travel, and anything else billed to the job.
6. **Overhead.** A percentage markup on that direct cost. It is not applied
   to itself or to profit.
7. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers an installer sanity-checks a bid against: price
per installed square foot, effective hourly billing rate, purchased vs
installed material, the waste dollars, the hour split across rooms and
stairs, and the **walk-away price** — total job cost, below which the job
makes nothing. Entering a price already on the table scores it against the
same cost base and says plainly whether it is under water. **Copy bid
summary** turns the result into a plain-text draft ready to paste into a
 proposal. **Download .txt** saves the same reviewable draft to the device's
 downloads folder for a job folder or CRM handoff; it does not upload anything.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting rates

The material types and tear-out rows ship with common ballpark waste,
production, and demo figures. **They are not an industry standard, a
benchmark, or a guarantee.** Real waste depends on layout and pattern; real
production depends on crew, substrate, and how much furniture is still in
the way. Every rate is editable, and picking a material never overwrites a
waste or install rate the installer has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `flooring-bid-usage` — never the rooms, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `room_added`, `room_removed`,
`proposed_price_compared`, `summary_copied`, `summary_downloaded`.

## Limitations

- Single currency and no tax or permit handling; the installer enters their own numbers.
- One crew, one material cost. Mixed-material houses are modeled as separate room rows sharing one supplier price — enter the job's blended material cost, or price each material as its own pass.
- Moisture testing, radiant heat, and commercial specs are out of scope.
- Starting waste and production figures are ballpark only.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or engineering
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
