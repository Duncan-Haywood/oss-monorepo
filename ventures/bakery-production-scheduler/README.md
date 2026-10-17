# Bakery Production Scheduler

A free browser tool for small and wholesale bakeries. List your products (batch
size, prep, proof and bake minutes, price and unit cost) and your orders with
due times. It plans backwards from every due time, shares your ovens and bakers
across the whole morning, and returns the timeline, the time the first person
has to start, the smallest extra oven or baker that makes it fit before you
open, and, when nothing can be added, which orders to turn down. Entirely
client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bakery-production-scheduler/

After using this, you can **know when to start baking and which wholesale
orders to take** instead of finding out at 3 a.m. that the croissants and the
sourdough want the same oven.

## Try it

Open [`index.html`](index.html) and click **Plan my bake**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies. Each order
splits into whole batches. A batch is prep (a baker), proof (nobody), bake (one
oven slot), then a cooling gap before the due time. Bakes are placed as late as
the oven slots allow, latest-due first; prep is then placed as late as the
bakers allow. `whatFixesIt` searches oven and baker counts together;
`dropToFit` keeps orders best-first by profit per oven hour and drops those
that break the plan.

## What this does not cover

Oven temperature and steam groups, mixer and bench space, breaks and pay,
delivery time, shelf life, ingredient stock and food-safety rules. Planning
arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing
leaves your browser; usage counts are local, opt-out-able and honour Do Not
Track.

## Run the tests

```
node --test
```
