# Porta Potty Event Quote Calculator

A free browser calculator for portable sanitation yards. It prices a porta
potty / portable restroom event rental the way the yard actually loses money
when it skips the math — every day the boxes sit, every extra pump-out, and
two truck round trips — and shows the margin before the quote goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/portable-restroom-event-quote/

Once the number is right, **Print proposal** turns it into the one-page sheet
the event organiser signs: the units as line items, the days on site, the
scheduled service visits, the price, a deposit split, a price-held date, and a
signature line. The yard's rental costs, haul costs, overhead, and margin are
not on it and are not printed.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/portable-restroom-event-quote -p 8080
# Run the tests
cd ventures/portable-restroom-event-quote && node --test
```

After using this, you can now quote an event from days on site, pump-outs, and
mileage in about a minute, which used to take a Saturday-special guess and a
hope that Friday drop and Sunday pickup were "in the unit price."

## The problem it solves

Customers ask for a Saturday special: headcount times a flat unit price.
That quote cannot see the shape of the job.

A 200-person wedding that needs boxes Friday through Sunday is **two or three
days of rent**, not one Saturday. Delivery is a round trip; pickup is a
second round trip — mileage is **four times the one-way distance**. A box that
sits overnight usually needs a pump-out. A $125 Saturday special on five units
is $625; on a typical 18-mile two-day job with one service visit that number
is often below cost before overhead.

The second thing that sinks these quotes is treating "how many porta potties
for 200 people?" as the price. Unit count is a planning question. The money
is in the days, the truck, and the service stops. [How many porta potties for
200 people?](how-many.html) answers the planning question and sends the yard
back here to price it.

## How it works

1. **Rental.** Each unit type × daily rent × days on site. Drop day and pickup
   day both count.
2. **Pump-outs.** Each unit type × service-each × extra service visits.
   Delivery already leaves them clean; pickup hauls them dirty. Extra visits
   are the ones in between.
3. **Haul.** Flat delivery + flat pickup + `4 × miles one way × rate per mile`.
   A weekend or holiday premium, if you use one, marks up haul only.
4. **Consumables and other.** Paper, sanitizer, deodorizer per unit, plus
   permits or after-hours.
5. **Overhead.** A percentage markup on that direct cost. It is not applied to
   itself or to profit.
6. **Price.** Cost ÷ (1 − target margin %), because margin is a share of the
   quote, not a markup on cost.

It then reports the numbers a yard sanity-checks a quote against: price per
unit-day, price per attendee when attendance is entered, and the **walk-away
price** — total cost, below which the job makes nothing. Entering a Saturday
special already on the table scores it against the same cost base and says
plainly whether it is under water.

Attendance, event length, alcohol, and food are optional. They drive a
**starting fleet estimate** (and a light-fleet flag if the quoted restrooms
are below that estimate). That estimate is planning arithmetic, not a
health-code, OSHA, or ADA determination. **Copy quote summary** turns the
result into a plain-text draft ready to paste into a message.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting rates and fleet estimates

Daily rents, pump-out prices, and the people-per-restroom table ship as
common ballpark figures. **They are not a published tariff, a health-code
table, a benchmark, or a guarantee.** Real yards replace them with their own
book. Picking a unit type never overwrites a rent or service price the
operator has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `portable-restroom-event-quote-usage` — never the
event, fleet, miles, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `quote_calculated`, `unit_added`, `unit_removed`,
`proposed_price_compared`, `fleet_estimate_applied`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the yard enters their own numbers.
- Surge (race finish, concert gate) is not modelled. Add units yourself if
  the crowd hits the restrooms at once.
- Restroom trailers are a unit type, not a separate labor-and-generator model.
- Local permit, placement, and accessibility rules are out of scope.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering,
or health-department advice, and it does not replace a qualified
professional. It does not tell anyone what to charge, how many units an
event requires, or whether a site meets ADA, OSHA, or local sanitation
rules. **You are responsible for reviewing and verifying its output before
relying on it**, and for meeting any obligation it helps you prepare for. To
the maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
