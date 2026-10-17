# house-sobol: which uncertain input of the house-cost model drives the uncertainty in a house's price?

Sixth project of track 12, open-source residential construction (`PROJECTS.md`, milestone 4 follow-up). [`house-costsens`](../house-costsens) tested only the driver splits and named the next step itself: vary the lever ranges and the 45% framing share jointly with the splits, with a global sensitivity analysis such as Sobol indices. This does that. Produced with AI assistance (Claude).

**Headline.** Treat every uncertain input of [`house-cost`](../house-cost) as random at once (ten lever ranges, the framing materials share, and the assumed driver splits) and ask what share of the price index's variance each one explains. **Floor area alone explains 53% (total 55%) and storeys 19%**; finish level, lot price and foundation type add about 6 to 9% each; everything else is under 2%. **The framing inputs together (labour, materials, and the materials share) explain under 1% of the variance**, so the lumber that [`house-plan`](../house-plan) and [`house-framing`](../house-framing) optimise barely registers in the price of a whole house. The assumed driver splits explain none of the variance alone (first-order about 0) and 1.7% through interactions (5% if I make them far vaguer), so the ranking in `house-cost` survives them, consistent with `house-costsens`.

**Builds on.** [`house-cost`](../house-cost) (the model, imported unchanged; its lever ranges are loaded from its `experiments/run.py`) and [`house-costsens`](../house-costsens) (the split perturbation idea), and through them NAHB, "Cost of Constructing a Home in 2024" (Eye on Housing, 23 Jan 2025, <https://eyeonhousing.org/2025/01/cost-of-constructing-a-home-in-2024/>). Method: Saltelli et al., "Variance based sensitivity analysis of model output. Design and estimator for the total sensitivity index", *Computer Physics Communications* 181(2), 2010 (first-order estimator); Jansen, "Analysis of variance designs for model output", *Computer Physics Communications* 117, 1999 (total-order estimator); Sobol', "Global sensitivity indices for nonlinear mathematical models and their Monte Carlo estimates", *Mathematics and Computers in Simulation* 55, 2001. These three were cited from memory and not re-read against the primary papers in this run. It builds on none of the CU Boulder groups in `prompt.md`.

**Not a design, not a quote.** Research code. Prices are an index (reference house = 100), not dollars, and nothing here has been reviewed by a licensed professional.

## Method
- **Inputs, all independent.** The ten lever parameters of `house-cost`, each uniform over that project's low-to-high range (so area is uniform on 1,600 to 2,400 sq ft, storeys on 1 to 3, and so on). The framing materials share of framing cost, uniform on 0.30 to 0.60 (`house-cost` assumes 0.45; the range is my choice). The driver splits as **one group** of 15 weights: each weight of each multi-driver stage is multiplied by exp(sigma z), z standard normal, then the stage is renormalised. sigma = 0.5 is the main case; 0.25 and 1.0 are shown. The tilt shape and sigma are my choices: there is no data on the true splits.
- **Outputs.** The price index, and the price per square foot index (so that "area" is not counted as a lever just because a bigger house costs more).
- **Estimators.** Saltelli (2010) first-order index S1 and Jansen total-order index ST, on outputs centred at their mean, with N = 4,096 base samples (plain seeded Monte Carlo, N x 14 + 2N model evaluations), and a 200-resample bootstrap for 95% intervals. Without centring the first-order estimator was badly noisy on this model (indices summing to 1.45); the fix is in `src/house_sobol/sobol.py` and a test checks the estimators on functions with known indices.
- The NAHB shares are never varied, so the reference house prices at exactly 100 under every draw.

## Reproduce
```bash
pip install pytest
cd research/house-sobol
python -m pytest -q tests                                                          # 6 tests
PYTHONPATH=src:../house-cost/src python experiments/run.py > experiments/results.txt   # about 30 s, deterministic
python experiments/figure.py                                                       # experiments/sobol.svg
```

## Results (from `experiments/results.txt`, sigma = 0.5, price index, sd 9.9 around a mean of 105.0)
| input | first-order S1 | total ST |
|---|---|---|
| floor area | 0.533 | 0.549 |
| storeys | 0.192 | 0.192 |
| finish level | 0.085 | 0.086 |
| lot price | 0.087 | 0.083 |
| foundation type | 0.064 | 0.067 |
| driver splits (group) | 0.000 | 0.017 |
| shape (aspect) | 0.008 | 0.008 |
| fees | 0.010 | 0.007 |
| framing labour, materials, materials share | 0.005, 0.004, 0.000 | 0.005, 0.003, 0.000 |
| build time | 0.002 | 0.001 |

- **The model is almost additive.** The first-order indices sum to 0.988; the only visible interactions involve floor area, where ST exceeds S1 slightly (0.549 against 0.533), and the splits, which act only through interaction (ST 0.017, S1 0.000).
- **Per square foot, area matters less and storeys matters more.** For the price per sq ft index, area explains 35%, storeys 25 to 27%, lot price and finish level about 12% each, foundation about 10% (`results.txt`). Taller-versus-wider is the main design decision once size is held aside.
- **Splits.** Total index of the splits group is 0.5% at sigma 0.25 and 1.7% at 0.5 and 5.0% at sigma 1.0 (the weights are then tilted by a factor of e per standard deviation, which is very vague). Even there it stays below storeys by a factor of four.
- **Framing.** The three framing inputs together explain under 1% of the price variance (total indices 0.5%, 0.3% and 0.0%) at every sigma. That agrees with `house-cost`, where a 14% framing-lumber cut is worth 0.85% of the price, and it is the number to hold against any claim that optimising lumber use changes what a house costs.

## Limitations
- **The ranges decide the answer.** A Sobol index is relative to the input distributions. I took `house-cost`'s lever ranges, which are themselves assumptions, as uniform. A narrower area range (a single builder's product line) would hand the variance to the other inputs; a wider framing price range (lumber prices swung more than 2x in 2021 to 2022; not checked here) would raise the framing share. Nothing here says which ranges are right.
- **Independence.** Real inputs correlate (a bigger house has a higher finish level; a basement goes with a cold climate). The indices assume none.
- **Stylised model.** `house-cost` has no code, structural or fire penalty for storeys, and the NAHB shares are a national average for one year. The result is about this model, not about housing. Index, not dollars. The Census Survey of Construction reconciliation and a priced takeoff remain undone (see `house-cost`).
- **Estimator noise.** Intervals are bootstrap intervals on 4,096 samples; the smallest indices (under about 0.01) are not distinguishable from zero, and small negative S1 values (the splits group) are estimator noise.

## Next steps
Replace the uniform ranges with ranges fitted to a priced takeoff from `house-plan`, add the correlations above, and add the climate-zone inputs from track 12 milestone 5 (`house-energy`) once it exists.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python standard library only, plus `house-cost`.
