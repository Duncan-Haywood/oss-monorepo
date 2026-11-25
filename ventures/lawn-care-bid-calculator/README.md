# Lawn Care Bid Calculator

A free browser calculator for independent lawn-care operators. It prices a
recurring property stop the way a crew actually runs one — turf, beds, and
edging each at their own production rate, plus windshield time — and shows
the margin before the price goes out.

**Live tool:** https://marisstella.app/lawn-care-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. It is live at the URL above, and you can host your own copy by serving this directory as static files.

```bash
# Serve it locally
npx http-server ventures/lawn-care-bid-calculator -p 8080
# Run the tests
cd ventures/lawn-care-bid-calculator && node --test
```

After using this, you can now send a per-visit and in-season monthly price
that already includes beds, travel, and fuel, which used to take a
spreadsheet guess from lot size alone.

## The problem it solves

Small lawn-care operators are told to bid by lot size or price per acre.
That rule cannot see the shape of the stop. A 10,000 sq ft suburban lawn
mows in about half an hour at a common residential rate, but 350 sq ft of
beds at 400 sq ft per hour is another 52 minutes, and an 18-minute drive
each way is 36 minutes of loaded labor on every visit. The mow is often the
smallest slice. A per-acre bid on that stop is a route the operator is
locked into for a season at a loss.

The second thing that sinks these bids is inventing winter. Quoting the
in-season monthly times twelve bills months the crew does not visit. Honest
annual is the per-visit price times the growing-season weeks actually
serviced.

## How it works

1. **Per-service labor.** Each row is a service with its own quantity and
   production rate (quantity one person covers per hour). Hours per visit =
   quantity ÷ rate. Acres convert to square feet before the rate is applied.
2. **Travel.** One-way minutes × 2 ÷ 60, times crew size: everyone on the
   truck is paid for the drive.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %), applied to
   on-property hours plus travel. Crew size shortens clock time on site; it
   does not reduce on-property person-hours, and it multiplies travel.
4. **Visit costs.** Fuel and dump per visit, times in-season monthly visits
   (visits per week × 52/12 — not a flat 4). Equipment and other costs are
   entered per calendar month and paid all year, so the in-season month
   carries monthly × 52 ÷ service weeks: the season's bills recover all twelve
   months.
5. **Overhead.** A percentage markup on that direct cost. It is not applied
   to itself or to profit.
6. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price. Per-visit is that monthly divided by in-season visits.
   Annual is per-visit × service weeks per year.

It then reports the numbers an operator sanity-checks a bid against: price
per acre per month (when a turf row is present), effective hourly billing
rate including travel, the hour split across services and windshield time,
and the **walk-away price**. Entering a monthly price already on the table
scores it against the same cost base. **Copy bid summary** turns the result
into a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

Niche background, in search words: [`how-to-price-lawn-mowing.html`](how-to-price-lawn-mowing.html).

## Production rates

The services ship with common ballpark rates as a starting point. **They are
not an industry standard, a benchmark, or a guarantee.** Real rates depend
on the crew, the equipment, obstacles, slope, wet grass, and how much is
actually done on each visit. Every rate is editable, and picking a service
never overwrites a rate the operator has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `lawn-care-bid-usage` — never the property, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `service_added`, `service_removed`,
`proposed_price_compared`, `summary_copied`, `share_copied`,
`proposal_printed`, `company_forgotten`. The copied draft includes the
calculated walk-away monthly cost and monthly profit so the operator can review
the guardrail alongside the proposed price.

## Limitations

- Single currency and no tax handling; the operator enters their own numbers.
- One recurring-stop model. One-off jobs (aeration, overseed, install) are
  not priced separately yet.
- "Other service" rows are labelled `Service N` rather than a custom name.
- Service weeks are a single annual count, not a week-by-week calendar.
- Fixed in PR (quality fix 2026-11-25): equipment and other monthly costs are
  now spread over the service weeks (monthly × 52 ÷ service weeks), so a $40
  a month share on a 32-week season recovers the full $480 a year; travel is
  charged per person on the truck; a blank cost field is an error, not a zero.
  Audit:
  [`portfolio/quality/audits/2026-11-19-lawn-care-bid-calculator.json`](../../portfolio/quality/audits/2026-11-19-lawn-care-bid-calculator.json).

## Disclaimer

This free tool is not legal, tax, financial, or business advice, and it does
not tell anyone what to charge. Outputs are arithmetic on the user's own
inputs. Verify every figure against real payroll, fuel, insurance, and dump
costs and against a qualified professional before relying on it or submitting
a bid. To the maximum extent permitted by law, the authors accept no
liability for loss or damage arising from its use.

FSL-1.1-MIT licensed — see [`LICENSE`](LICENSE).