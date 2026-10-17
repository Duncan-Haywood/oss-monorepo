# house-costsens: does the house-cost lever ranking survive its assumed driver splits?

Fifth project of track 12, open-source residential construction (`PROJECTS.md`, milestone 4 follow-up). [`house-cost`](../house-cost) ranks the levers that move a new home's price (size, storeys, finish, lot, foundation, shape, fees, framing, build time) using NAHB's 2024 cost shares plus **my assumed splits** of each construction stage over geometric drivers (floor area, footprint, wall area, fixed). Its own next step was "put ranges on the driver splits and report how the lever ranking changes". This does that: a Monte Carlo that redraws every split and recomputes the ranking. Produced with AI assistance (Claude).

**Headline.** Floor area stays the biggest lever in 96% to 100% of draws, however loosely the splits are held (Dirichlet concentration k = 5, 20, 80), and every lever's median rank equals its baseline rank. The one that moves is **storeys**: its 5 to 95% swing for one versus three storeys at the same area is 9.0 to 19.9 index points at k = 20 (baseline 14.0), and 5.1 to 24.1 at k = 5, so how much a taller house saves is the least certain claim in `house-cost`. The framing-lumber result (a 14% cut is worth 0.85% of the price, 2.37% with 20% less framing labour) does not move at all.

**Builds on.** [`house-cost`](../house-cost) (the model, imported unchanged; its lever ranges are loaded from its `experiments/run.py`) and, through it, NAHB, "Cost of Constructing a Home in 2024" (Eye on Housing, 23 Jan 2025, <https://eyeonhousing.org/2025/01/cost-of-constructing-a-home-in-2024/>). It builds on none of the CU Boulder groups in `prompt.md`.

**Not a design, not a quote.** Research code. Prices are an index (reference house = 100), not dollars, and nothing here has been reviewed by a licensed professional.

## Method
- For each stage with more than one driver, redraw its split from a Dirichlet centred on the assumed split with concentration k. Small k means a vague belief in the assumption; large k trusts it. Single-driver stages are unchanged. k = 5, 20 and 80 are my choices, and so is the Dirichlet shape: there is no data on the true splits.
- The NAHB shares are never redrawn, so the reference house prices at exactly 100 under every draw (a test checks it).
- 2,000 draws per k, seeded. Per draw: each lever's absolute price swing between its low and high end (house-cost's ranges), its rank, and the value of the lumber saving.

## Reproduce
```bash
pip install pytest
cd research/house-costsens
python -m pytest -q tests                                                         # 7 tests
PYTHONPATH=src:../house-cost/src python experiments/run.py > experiments/results.txt   # seconds, deterministic
python experiments/figure.py                                                      # experiments/ranking.svg
```

## Results (from `experiments/results.txt`)
- **Size is robust.** Largest swing in 96% (k = 5), 100% (k = 20) and 100% (k = 80) of draws; swing 24.3 (20.6 to 26.9) at k = 5.
- **Storeys is the soft one.** Median swing 13.5 (5.1 to 24.1) at k = 5, 13.9 (9.0 to 19.9) at k = 20, 14.0 (11.4 to 16.6) at k = 80. It stays in the top three in 74%, 91% and 100% of draws; when it drops out, finish level or lot price takes its place.
- **Shape (aspect 1 to 3)** swings 2.7 (1.8 to 3.6) at k = 5, but stays sixth of ten.
- **Seven of ten levers do not move.** Finish level, lot price, foundation type, fees, framing labour, framing materials and build time act on stages whose share is fixed by NAHB, or on non-construction items, so redrawing the *splits* cannot change their swings. This is a structural fact about the model, not a finding about housing, and it means the Monte Carlo only tests the geometric levers.
- **Lumber saving.** Unchanged at every draw: -0.85% of price, -2.37% with 20% less framing labour.

## Limitations
- This tests only the splits, not the other assumptions it inherits: the lever ranges, the 45% framing materials share, the fixed-lot assumption, and the NAHB shares themselves (a national average, one year). The rankings of non-geometric levers depend mostly on the ranges, which are not varied here.
- The Dirichlet prior is symmetric in spirit but arbitrary; a skewed prior (for example, interior finishes nearly all area-driven) could give other answers. k is a stand-in for how wrong I think I might be.
- The model has no stair, structural or fire-code penalty for extra storeys, so even the storeys baseline is an upper bound.
- Index, not dollars. The Census Survey of Construction reconciliation and a priced takeoff remain undone (see `house-cost`).

## Next steps
Vary the lever ranges and the 45% framing share jointly with the splits (a global sensitivity analysis such as Sobol indices). Replace the assumed splits with ones fitted to a priced takeoff from `house-plan`.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python standard library only, plus `house-cost`.
