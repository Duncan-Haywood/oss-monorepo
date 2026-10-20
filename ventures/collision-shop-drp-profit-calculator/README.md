# Collision Shop DRP Profit Calculator

A free browser tool for collision repair shop owners deciding whether to sign (or
keep) an insurer direct repair program. Enter a typical repair order at your retail
prices and at the program's labor rate, parts discount and paint-and-materials cap,
the jobs you already do for that insurer and the new volume it promises. It shows
your month with and without the program, the new volume you need to break even, what
one program job gives up, what an hour earns each way, and the lowest labor rate
worth accepting. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/collision-shop-drp-profit-calculator/

After using this, you can **put a number on the program before you sign it** and
hold a floor rate and a written volume promise in the negotiation.

## Try it

Open [`index.html`](index.html) and click **Compare**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. A repair order sells labor
(body and refinish hours at their rates), paint and materials (per refinish hour)
and parts (cost plus markup; a program takes its discount off that price). Costs are
flat-rate technician pay with burden, parts, the share of the retail materials charge
the paint costs you, other cost per job and, on program jobs, your paperwork cost and
any network fee. The month adds whole technicians (hours over a technician's monthly
capacity need another, each with a fixed cost), fixed overhead and your pay. Jobs you
already do for the insurer are paid at retail without the program and at its terms
with it; promised new orders exist only with it. Break-even is the new volume from
which the program stays at least as good as none; the rate search steps the program
labor rate down in $1 steps.

## What this does not cover

Whether the volume is delivered (the number is the insurer's promise, not a
measurement), cycle-time scorecards, steering and consumer-choice rules, contract
terms, effects on your retail jobs, seasonality and tax. Planning arithmetic, not
advice. Not affiliated with any insurer or estimating system.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
