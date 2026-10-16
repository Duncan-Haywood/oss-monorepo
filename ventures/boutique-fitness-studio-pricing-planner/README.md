# Boutique Fitness Studio Pricing Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/boutique-fitness-studio-pricing-planner/>

A free browser tool for yoga, pilates, barre, cycling and dance studio owners. Enter your
timetable, costs, unlimited members, class packs and drop-ins; it shows monthly profit, what a
visit earns under each plan (counting pack classes that are never taken), the class size that
breaks even, where unlimited beats packs and drop-ins for a member, what empty seats are worth,
and the unlimited price that earns the most on a member-loss rate you set. Entirely client-side.

After using this, you can **tell whether your plan prices make money per visit and what to charge
for unlimited**, which used to be copied from the studio down the road.

## Try it

Open [`index.html`](index.html) and click **Price the studio**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Seats = classes a month x spots. Visits
wanted = unlimited members x classes each + packs sold x classes in pack x (1 - never taken) +
drop-ins. If wanted visits exceed seats, pack and drop-in revenue is scaled to the share that fits;
the unlimited fee is not. Net per visit is price over visits taken, less the card fee. The unlimited
price search moves the price 80% to 140% and loses `priceSensitivity` % of members per 1% rise
(linear, so a best price exists).

## What this does not cover

Member churn over time, seasonality, real response to a price change (your assumption), lease terms,
instructor classification and pay law, sales tax on memberships, insurance, refunds and freezes.
Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves your browser; usage
counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
