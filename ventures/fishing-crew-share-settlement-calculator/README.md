# Fishing Crew Share Settlement Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fishing-crew-share-settlement-calculator/>

A free browser tool for commercial fishing boats. Enter the catch (species,
pounds, price), the costs taken off the top (commission, fuel, ice, bait,
food), the boat's percentage and each crew member's shares. You get every
payout, the day rate per hand, the boat's trip profit after its own daily
cost, the gross sales needed for a deckhand to clear your target, and a price
sensitivity. Entirely client-side; nothing is uploaded.

After using this, you can **settle a trip and see what a price drop does to crew
pay and to the boat**, instead of redoing the lay on paper at the dock.

## Try it

Open [`index.html`](index.html) and click **Load an example**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies.

- `settle`: gross, minus commission, minus shared trip costs, is the net. The boat
  takes its percentage; the crew pool is split by shares; personal charges come off
  individual payouts. On a losing trip the crew pool is zero and the boat absorbs it.
- `breakEven`: gross sales at which the boat covers its own costs, and at which a
  one-share hand clears the target day rate.
- `priceSensitivity`: the same trip at lower and higher prices; costs do not move,
  so the swing lands harder on net.

## What this does not cover

Your actual crew agreement, taxes, vessel and crew rules, permit or quota lease
costs, dock adjustments. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing
leaves your browser; usage counts are local, opt-out-able and honour Do Not
Track.

## Run the tests

```
node --test
```
