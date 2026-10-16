# Warehouse Slotting Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/warehouse-slotting-optimizer/>

A free browser tool for small warehouses, 3PLs, online sellers with a stockroom and shops with a back room: **describe your shelf grid, list your SKUs with picks and size, and get the bay every SKU should live in to cut picker walking.** It also lists the few swaps and moves that save the most first, with the labor to make them and the weeks to pay back. Nothing is uploaded.

After using this, you can **stop putting stock wherever there is space when it arrives**: see what the walk costs a year, move the handful of SKUs that matter, and know when the next move stops paying for itself.

## Model

- The dock is at one corner. Aisle `a` is `dockToAisleFt + (a-1) * aisleSpacingFt` from it and bay `b` is `dockToBayFt + (b-1) * bayLengthFt` along the aisle. One pick is a round trip of `2 * (x + y)`.
- An order with several lines is one return-route tour: `2 * xmax` along the front aisle plus `2 * ymax` into every visited aisle, down to its deepest bay.
- A SKU taking several bays is picked from its nearest bay.
- With one line per trip and every unlocked SKU the same size, ranking by picks and filling bays nearest-first is optimal (rearrangement inequality); a test compares it with exhaustive search over every placement. In every other case the tool starts from two orderings and swaps pairs of SKUs until no swap shortens the walk, and says it is not proven optimal.
- Quick wins start from your current layout and greedily take the best of: swapping two same-size SKUs, or moving one SKU into an empty run of its size. Each line reports cumulative saving, labor and payback.
- Locked SKUs never move and their bays are not offered to others. SKUs with no position are placed in the first free space in the order listed.

Not modelled: pick-face height and weight, product families, batch or zone picking, multiple docks, replenishment trips, congestion, seasonal change.

Up to 40 SKUs and 3,000 sample orders.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
