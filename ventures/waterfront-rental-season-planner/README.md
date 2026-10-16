# Waterfront Rental Season Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/waterfront-rental-season-planner/>

A free browser tool for kayak, paddleboard, pontoon and other boat rental
operators. Enter your fleets, rental lengths, prices, what people would book on a
weekday and a weekend, and your season costs; it shows the season's profit, how
many days lost to weather the season can take, the rentals your fleet turns
away, what one more kayak or boat earns and pays back in, and the price that
earns the most along a demand curve you set. Entirely client-side.

After using this, you can **tell whether another boat is worth buying and how
wet a summer you can survive**, which used to be a guess.

## Try it

Open [`index.html`](index.html) and click **Plan the season**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Capacity per unit-day =
whole rentals that fit in the open day (rental length plus turnaround, the last
needing none). Sold = the smaller of the demand you type (weekday, weekend) and
fleet capacity; the rest is turned away. Weather removes a share of open days:
revenue, per-rental cost and staff shrink with it, the dock and insurance do not.
Moving the price moves demand along a linear curve (`priceSensitivity` % of
bookings lost per 1% price rise; linear so a best price exists). One more unit
earns only from demand the fleet was already turning away.

## What this does not cover

Real demand at a new price (your assumption), insurance, licensing, safety
equipment and capacity rules, waivers, permits, employment law, tax, repairs
beyond the wear you enter. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
