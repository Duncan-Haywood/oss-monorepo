# Hay Baling Own vs Hire Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hay-baling-own-vs-hire-calculator/>

A free browser tool for hay producers deciding whether to buy a baler (with the
mower and rake it needs) or keep hiring custom baling. Enter acres, yield, bale
weight, equipment cost and the custom price per bale; it compares the year's
cost both ways, finds the break-even acreage, gives your cost per bale and the
sale price that earns your margin, and shows what to charge neighbours so
outside baling pays for its share of the machine. Entirely client-side.

After using this, you can **see how many acres justify your own baler**, and
whether baling for neighbours would undercut the local contractor and still pay.

## Try it

Open [`index.html`](index.html) and click **Compare**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Ownership is yearly
straight-line depreciation, interest on the average investment, and insurance
and housing, plus fuel, repairs and labour per acre per cut and wrap per bale.
Hiring is the custom price per bale plus any extra field work, plus the share of
hay value lost waiting for a contractor. Break-even acres = fixed cost / (hired
cost per acre - own running cost per acre).

## What this does not cover

Weather and forage quality, hay market prices, financing and tax treatment,
tractor cost, insurance, contractor availability. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
