# Escape Room Pricing and Capacity Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/escape-room-pricing-capacity-planner/>

A free browser tool for escape room and other timed-slot venue owners (axe
throwing, VR arenas, themed experiences). Enter rooms, opening hours, game and
reset length, price per player, the occupancy you see and your costs; it counts
sellable slots, shows monthly profit and the occupancy needed to break even,
searches for the price that earns the most along a demand curve you set, and
shows what a shorter reset, a minimum group charge or a slow month would do.
Entirely client-side.

After using this, you can **see how full your rooms must be to pay for the
hosts and rent**, and whether a price change is worth testing.

## Try it

Open [`index.html`](index.html) and click **Plan**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Slots per room-day =
whole games that fit, the last needing no reset. Bookings = slots x occupancy,
with peak and off-peak slots priced and filled separately. Moving the price moves
occupancy along a linear demand curve around the price where you observed it
(`elasticity` % of bookings lost per 1% price rise): linear, because a
constant-elasticity curve below 1 has no best price. Hosts are paid every open
hour; break-even is the occupancy scale at which contribution equals fixed cost.

## What this does not cover

Real demand at a new price (the sensitivity is your assumption), leases,
insurance, fire and safety rules, employment law, tax, seasonality, reviews and
competitors. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
