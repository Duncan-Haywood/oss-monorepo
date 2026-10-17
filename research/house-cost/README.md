# house-cost: where does a new home's price go, and which levers move it most?

Fourth project of track 12, open-source residential construction (`PROJECTS.md`, milestone 4). A small, open price model for a new single-family home: each construction stage scales with a geometric driver (floor area, footprint, wall area), and the non-construction costs (lot, overhead, financing, commission, marketing, profit) follow from NAHB's 2024 cost shares. A sweep then asks which lever (size, storeys, shape, finish level, foundation, lot, fees, build time, framing materials and labour) moves the price most. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-cost/

**Headline.** In this stylised model, size dominates: 1,600 to 2,400 sq ft moves the price by 24 index points (reference = 100). Next come storeys (14 points for one versus three at the same area), finish level (10) and lot price (10). A 14% cut in framing lumber (the `house-plan` default plan against its best 896 sq ft plan) is worth only 0.85% of the price, and 2.4% if it also cuts framing labour by 20%. Framing is 10.7% of the price, so lumber alone cannot cut it much; 35.6% of the price is not construction at all.

**Builds on.** NAHB, "Cost of Constructing a Home in 2024" (Eye on Housing, 23 Jan 2025, <https://eyeonhousing.org/2025/01/cost-of-constructing-a-home-in-2024/>, read 2026-10-17), the source of every share used. The framing numbers come from [`house-plan`](../house-plan) (lumber per sq ft) and [`house-framing`](../house-framing) (why labour carries the case). It builds on none of the CU Boulder groups in `prompt.md`.

**Not a design, not a quote.** This is research code. The price is an index, not dollars. It is not an estimate for any real house, site or market, and nothing here has been reviewed by a licensed professional.

## Use it
```bash
cd research/house-cost
PYTHONPATH=src python3 - <<'PY'
from house_cost.model import House, price
print(price(House(area=1600, storeys=1, finish=0.8))["price"])   # index, reference house = 100
PY
```

## Method
- **Anchor.** Shares of the 2024 average sales price: construction 64.4%, finished lot 13.7%, profit 11.0%, overhead and general expenses 5.7%, sales commission 2.8%, financing 1.5%, marketing 0.8%. Shares of construction cost: interior finishes 24.1%, major system rough-ins 19.2%, framing 16.6%, exterior finishes 13.4%, foundations 10.5%, site work 7.6%, final steps 6.5%, other 2.1%. The price shares sum to 99.9% as published; the model adds the 0.1% to the lot so they sum to 1.
- **Reference house.** 2,000 sq ft, two storeys, footprint 1.5 times as long as wide. At the reference the model reproduces every NAHB share exactly (a test checks it). The reference size and shape are my choice, not the survey's average: the page I read gives shares only, so I did not use any dollar figure or house size and report a price **index** (reference = 100).
- **Drivers.** Each stage is split into a fixed part and parts that scale with floor area, footprint, perimeter or storey-weighted wall area (`STAGE_DRIVERS` in `model.py`; for example framing is 35% floor area, 40% wall area, 25% footprint). **These splits are my assumptions, not survey data.** Interior finishes and foundations take a multiplier (finish level, slab or basement).
- **Everything else.** Overhead scales with construction cost, financing with construction plus lot times build time, and commission, marketing and profit are shares of the price, so the price solves one linear equation.
- **Lever ranges** (such as lot price x0.7 to x1.3) are plausible ranges chosen by me, not measured distributions.

## Reproduce
```bash
pip install pytest
cd research/house-cost
python -m pytest -q tests                                  # 8 tests
PYTHONPATH=src python experiments/run.py > experiments/results.txt   # instant, deterministic
python experiments/figure.py                               # experiments/levers.svg from results.txt
```

## Results (from `experiments/results.txt`)
- **Where the price goes (NAHB 2024).** Construction is 64.4% of the price; within it, framing is 10.7 points of price, foundations 6.8, interior finishes 15.5. The other 35.6% is the lot (13.8), profit (11.0), overhead (5.7), commission (2.8), financing (1.5) and marketing (0.8).
- **Lever swings** (price index at the low and high end; reference 100): size 1,600 to 2,400 sq ft 87.8 to 112.0; one to three storeys at 2,000 sq ft 111.6 to 97.6; finish level 96.0 to 106.0; lot price 95.1 to 104.9; slab to basement 97.4 to 105.3; shape (aspect 1 to 3) 99.6 to 102.3; fees 98.7 to 101.3; framing labour 99.2 to 101.5; framing materials 99.1 to 100.9; build time 99.5 to 100.5.
- **Size.** Price per sq ft falls with size because of fixed parts (kitchen, baths, site work, lot): 156.6 at 800 sq ft, 109.8 at 1,600, 100 at 2,000, 79.4 at 4,000. This is driven by my fixed-part assumptions and the unscaled lot; a bigger house also tends to sit on a bigger, dearer lot, which the sweep does not capture.
- **Storeys.** Two storeys cost 10.5% less than one at the same area (99.6 against 111.3 at aspect 1), mostly through footprint-driven foundations, roof and site work. Three storeys save 2.4 more points, with no stair, structural or fire-code penalty in the model, so that is an upper bound.
- **A lumber saving.** The default `house-plan` plan uses 5.59 bf/sq ft and the best 896 sq ft plan 4.83, a ratio of 0.864. If framing is 45% materials (my assumption), that is worth 0.85% of the price. Adding 20% less framing labour makes it 2.37%. Lumber optimisation pays through labour, as `house-framing` found.

## Limitations
- **Shares of one national average, not a price.** The NAHB survey is a national average of builders who responded; regions, builder types and years differ a lot. Nothing here is calibrated to a market, and the Census Survey of Construction reconciliation named in the milestone is **not done**: I did not read the Census data.
- **The driver splits and lever ranges are assumed.** The ranking of levers depends on them, in particular the fixed shares. Change `STAGE_DRIVERS` and size may matter less. No sensitivity analysis over the splits was run.
- **No unit prices, labour hours or dated price sources.** The milestone asked for a quantity-based model priced from the `house-plan` takeoff; this version does not price the takeoff and uses shares instead. That is the next step. No dollar figure is claimed.
- The model ignores that the levers interact with code and structure (stairs, fire separation, wind and seismic), financing rates, and permit fees by jurisdiction.
- Finished-lot cost is held constant while size varies.

## Next steps
Price the `house-plan` takeoff with sourced and dated unit costs (RSMeans-style data is paid, so use open sources such as BLS producer price indexes and published lumber futures) and compare it with the share-based model. Read the Census Survey of Construction and reconcile. Put ranges on the driver splits and report how the lever ranking changes. Add regional multipliers.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python only. The NAHB shares are published figures read from a web summary, not from the full report.
