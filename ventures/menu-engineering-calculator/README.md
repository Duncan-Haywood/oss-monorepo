# Menu engineering calculator

A free, browser-only calculator that sorts an independent restaurant's menu into
stars, plowhorses, puzzles and dogs — the Kasavana & Smith matrix (Michigan
State, 1982) — from three numbers per dish the operator already has: plate food
cost, menu price, and units sold over a period.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/menu-engineering-calculator/

Nothing is uploaded. There is no account, no build step, and no network request.

## Why this exists

The number the restaurant industry quotes is food cost percentage, and it ranks
a menu wrong. A $34 steak at 40% food cost contributes $20.40 a plate; a $9
pasta at 20% contributes $7.20. The pasta wins on the percentage and loses by
$13 on the dollars that pay rent. A kitchen that ranks by percentage promotes
its cheapest-to-make plate straight into a worse week.

The matrix fixes that by crossing two axes:

- **Contribution margin** — menu price minus plate food cost, in dollars,
  measured against the menu's **weighted** average (total margin ÷ total
  covers). The weighting matters: an unweighted mean lets a $40 plate that sold
  twice pull the bar as hard as the $14 plate that sold four hundred times.
- **Popularity** — the dish's share of covers, against 70% of an equal share.
  On a ten-item menu the equal share is 10%, so the bar is 7%.

Both thresholds are printed on the page rather than applied invisibly, because
the 70% is a convention an operator may reasonably disagree with.

## What it reports

- Every dish classified, with its contribution margin, food cost percentage,
  menu mix percentage, and total margin contributed.
- The two thresholds the classification used.
- Menu totals: covers, sales, food cost, overall food cost percentage against a
  target the operator sets, and contribution margin annualised from the period.
- The size of one stated price increase applied across the plowhorses, over the
  period and annualised — always printed alongside the assumption that makes it
  arithmetic rather than a forecast: that the same number of people order at the
  new price.

## What it does not do

It does not tell anyone what to charge, what to cut, or how to lay out a menu.
Those depend on the room, the clientele, and what the kitchen can execute on a
Saturday. The tool reports a classification and the thresholds behind it; the
`notes never tell the operator what to do` test in `calc.test.mjs` is what keeps
that line from drifting.

## Layout

| File | What it is |
| --- | --- |
| `calc.mjs` | All the arithmetic and validation. No DOM. |
| `calc.test.mjs` | 25 tests, including a hand-worked four-dish menu with one item in each quadrant. |
| `index.html` | The page. Imports `calc.mjs` directly as an ES module. |
| `page.test.mjs` | Asserts the page and the module agree, and that the FAQ JSON-LD matches the visible copy. |
| `how-menu-engineering-works.html` | The guide page: the matrix, both thresholds, and the worked menu. |
| `usage.mjs` / `usage.test.mjs` | Anonymous local event counts, opt-out, DNT and GPC honoured. |

## Tests

```
cd ventures/menu-engineering-calculator && node --test
```

54 tests across the four suites. No dependencies.

## Privacy

The usage counter stores an event name and the current day in `localStorage`,
under `menu-engineering-usage`. It never stores a dish name, a plate cost, a
menu price, or a cover count — a dish name is often the name of the
restaurant's own signature plate. It is off entirely for a browser sending Do
Not Track or Global Privacy Control, and there is a checkbox on the page.
