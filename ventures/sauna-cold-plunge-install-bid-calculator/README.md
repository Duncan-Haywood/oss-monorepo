# Sauna & Cold Plunge Install Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sauna-cold-plunge-install-bid-calculator/>

A free browser tool for backyard sauna and cold plunge installers and the small builders adding them.
Enter the hours on site, the drive, your pay, rig and consumables, materials and
fixed costs; it shows the price that earns your target margin, what the job
leaves if it runs long, how the price climbs with distance, a check on a price
you were offered, and how many jobs a month cover your fixed costs. Entirely
client-side.

After using this, you can **bid an install knowing what delivery, the electrician and a
long day cost you**.

## Try it

Open [`index.html`](index.html) and click **Price the install**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Cost is your time on
site plus the round-trip drive, helper time, tool wear per on-site hour,
consumables per build hour, truck cost per mile, equipment and materials, an electrician subcontract (marked up like materials), and fixed monthly
costs spread over the hours you can bill (drive included). Price = costs other
than materials divided by (1 - card fee - margin), plus materials with their
markup; a minimum call-out can override it, and the reported margin is
recomputed from the final price. Overrun stretches on-site hours only, not the
drive. Break-even jobs = fixed costs / contribution per job.

## What this does not cover

Electrical and building code, clearances, permits and inspection, licensing, insurance, tax, what
your local market pays, and how long an install really takes. Planning arithmetic,
not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
