# Pick Path Optimizer

A free browser tool for small warehouses, 3PLs and online sellers who pick from shelves: **paste where each SKU lives and a day of orders, and get carts of orders, a pick list per cart in walking order on the provably shortest route, and the walking, hours and wages saved** against one order per trip on an S-shape route. Nothing is uploaded.

**Live tool:** https://marisstella.app/pick-path-optimizer/

After using this, you can **stop sending pickers down every aisle end to end with one order at a time**: group orders onto carts, hand each picker a list in the order they will pass the shelves, and know what that is worth a year.

## What it does

- **Exact shortest route** for a cart through a single block of parallel aisles with a front cross aisle (dock or pack station) and an optional back cross aisle: the dynamic programme of Ratliff and Rosenthal (*Operations Research* 31(3), 1983). It keeps, for the two ends of the current aisle, only their degree parity and whether they belong to the same piece of the partial route, and tries the six in-aisle patterns an optimal route can use (pass through once or twice, or go in from the front and/or the back and turn round, skipping one gap) with 0, 1 or 2 copies of each cross-aisle segment. Linear in the number of aisles. The route is then laid out as one walk from the dock (Hierholzer) and drawn on a map.
- **Rules of thumb for comparison:** S-shape (traverse every aisle with a pick; an odd last aisle is in-and-out), largest gap, and return (in and out of each aisle; the only possible route when aisles are dead ends).
- **Order batching:** seed-first (the order with the longest walk alone, then the order that adds least walking, until the cart is full by orders or by lines), then local search moving and swapping single orders between carts while the total walk falls. Candidates are pre-filtered by new aisles needed and scored by the exact route. Good, not proven optimal.
- **Six options side by side** on the same orders: one order per trip on S-shape, largest-gap and shortest routes; carts in arrival order on S-shape and shortest routes; carts grouped by the tool on shortest routes. Feet, hours a day and wages a year for each.
- **Pick lists:** every stop with aisle, bay, SKU, quantity and the tote (order) it goes in; CSV of every cart.

## Checks

`route.test.mjs` compares the exact route with Held-Karp (an exhaustive search over visiting orders, using the shortest-path distance between two shelf positions) on 600 random small layouts, with and without a back cross aisle and with the dock at an aisle or between aisles, and checks the drawn walk has the same length, starts and ends at the dock, and only changes aisle along a cross aisle. Every rule of thumb is checked never to beat it. `calc.test.mjs` checks every order lands in exactly one cart within the limits, every pick list covers every line once, and the example figures quoted on the page.

On the page's placeholder example (10 aisles of 20 four-foot bays, 160 SKUs with Zipf-shaped popularity, 120 orders of one to four lines): S-shape one at a time walks 29,228 ft; shortest route one at a time is 13.5% less; carts of four in arrival order on the shortest route 58.9% less; carts of four grouped by the tool 70.6% less. These are placeholder orders, not a business's.

## Model and limits

- Aisle `a` is at `(a-1) * spacing`; bay `b` is at `(b - 0.5) * bayLength` from the front cross aisle, so aisle length is `bays * bayLength`. Both faces of an aisle are picked from its centre line. Distances are walking-line distances; cross aisles have no width.
- The dock is a point on the front cross aisle (`depotAisle` may be fractional, for example 0.5 for left of aisle 1).
- Not modelled: several blocks or middle cross aisles, one-way aisles, congestion, cart volume and weight, pick time at the shelf (the same for every option), sorting at the pack station, order cut-offs.
- Up to 60 aisles, 200 bays an aisle and 1,500 orders at a time.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`plan_run`, `example_loaded`,
`picklist_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
