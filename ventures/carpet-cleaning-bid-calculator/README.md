# Carpet Cleaning Bid Calculator

A free browser calculator for independent carpet-cleaning technicians. It
prices a stop the way the job actually takes time — each room divided by a
soil-specific extraction rate, then stairs, pet-urine extra passes,
upholstery, furniture moving, and the drive — and shows the margin before
the quote goes out.

**After using this, you can now quote a house from rooms and add-ons and
see whether a posted per-room special still covers the stop**, which used
to take a guess on the driveway plus a number copied from a competitor.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/carpet-cleaning-bid-calculator -p 8080
# Run the tests
cd ventures/carpet-cleaning-bid-calculator && node --test
```

How technicians actually price a stop, in search words:
[How to price carpet cleaning](how-to-price-carpet-cleaning.html).

## The problem it solves

Customers search "carpet cleaning cost per room." Competitors answer with a
$99–$129 three-bedroom special. That number assumes vacant, light-soil
rooms, no stairs, no pets, no sofa, and a house next door. The stop that
actually books is a lived-in house with two flights, a urine-stained living
room, a sofa the customer "thought was included," and a 40-minute drive.

The second thing that sinks these quotes is payroll burden. A technician
paid $20 costs more like $26 once employer taxes, workers' compensation,
liability, and unpaid windshield time are counted. Operators who price off
the raw wage and the posted special are short before they park.

## How it works

1. **Per-room extraction.** Each row is a room with its own square footage
   and a production rate (sq ft extracted per hour). Soil presets start
   from common ballpark figures — vacant/light, normal household, heavy /
   restoration — and stay editable.
2. **The work a special cannot see.** Stairs as flights × minutes, one extra
   extraction pass on rooms marked for pet treatment, upholstery pieces
   timed in minutes, furniture moving, and round-trip drive time.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %).
4. **Chemistry and the rest of the stop.** Chemicals per carpet square foot,
   extra chemistry per pet room, plus water, disposal, and fuel.
5. **Overhead, then price.** Overhead is a markup on direct cost. Price is
   cost ÷ (1 − target margin %), because margin is a share of the customer's
   number. A posted minimum ("$149 to roll the truck") is a floor on that
   quote, not a substitute for knowing cost.

It then reports the numbers a technician sanity-checks a quote against:
price per room and per square foot, effective hourly rate *including the
drive*, on-site rate without it, the share of hours that are not carpet
extraction, and the **walk-away price** — total job cost, below which the
stop makes nothing. Entering a special already on the table scores it
against the same cost base and says plainly whether it is under water.
**Copy bid summary** turns the result into a plain-text draft ready to
paste into a text or invoice.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Production rates

Soil types ship with common ballpark extraction rates as a starting point.
**They are not an IICRC standard, a benchmark, or a guarantee.** Real rates
depend on the crew, the machine, the fibre, how long the soil has sat, and
whether furniture is still in the room. Every rate is editable, and picking
a soil type never overwrites a rate the technician has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `carpet-cleaning-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `room_added`, `room_removed`,
`upholstery_added`, `upholstery_removed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax or travel surcharge table; the technician
  enters their own numbers.
- One technician on the clock. A two-person crew should enter the combined
  loaded wage or double the hours they actually both work.
- No separate line for protector, deodorizer add-ons beyond pet chemistry,
  or commercial night work.
- Area rugs are a room row (or an upholstery row) rather than a dedicated
  rug model.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or business
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

This free tool does not tell anyone what to charge. Outputs are arithmetic
on the user's own inputs.

MIT licensed — see [`LICENSE`](LICENSE). Optional support via the
[project on GitHub](https://github.com/Duncan-Haywood/monorepo-projects)
never changes what the tool does.
