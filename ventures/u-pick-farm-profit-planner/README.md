# U-Pick Farm Profit Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/u-pick-farm-profit-planner/>

A free browser tool for u-pick farms, pumpkin patches and small agritourism
operations. Enter open days, weather losses, daily visitors, admission, what
people pick and spend, and your season costs; it returns season profit, the
visitors per day and the admission you need to break even and to hit a goal,
what each visitor leaves after crop and food cost, what a rainy season does to
the result, and a profit grid across attendance and admission. Entirely
client-side; nothing is uploaded.

After using this, you can **set admission and decide how many crew days to
staff** from your own numbers instead of copying the farm down the road.

## Try it

Open [`index.html`](index.html) and click **Plan my season**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies. Open days minus
weather losses give effective days; each visitor pays admission, picks pounds
at a price (crop cost and shrink come off) and spends on extras (you keep a
margin). Crew is paid per open day, season costs are fixed, card fees come off
billed revenue.

## What this does not cover

Weekday/weekend mix, group pricing, season passes, crop failure beyond the
shrink you enter, permits, liability rules and tax. Planning arithmetic, not
advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing
leaves your browser; usage counts are local, opt-out-able and honour Do Not
Track.

## Run the tests

```
node --test
```

## Chance of a losing season

`seasonOdds` in `calc.mjs` mixes a normal season (each open day lost with the weather-loss share) with a wet one
(chance and loss share are inputs), exactly over the number of days lost, and reports the chance the season loses
money plus 10th, 50th and 90th percentile profit. Weather arriving in streaks, not one day at a time, is what
actually sinks a season.
