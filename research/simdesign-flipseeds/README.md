# simdesign-flipseeds: do the mass-weighting machine-choice flips of `simdesign-coverweight` survive across seeds?

Eighth project of the simulation-first design track (`PROJECTS.md`, track 5), taking the second "next step" of [`simdesign-coverweight`](../simdesign-coverweight): its machine-choice flips between count and mass weighting came from one seed. Produced with AI assistance (Claude). Everything here is stylised: the DFM rules, material properties and machine prices are the **assumed** round numbers of the earlier projects, the part family is a random sample and the mass weight is a crude same-material volume proxy. Simulated result only; no part was made.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-flipseeds/

**Builds on.** `research/simdesign-coverweight` (`sample_parts`, `weights`, `wshop_value`), `research/selfrep-nextmachine` (`exhaustive`) and `research/simdesign-processcover`, all imported unchanged. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- For each family (`log`, `small`, `large`, all with the tip load) and budget, draw 20 independent samples of 20 000 parts (seeds 5 to 24, disjoint from the seeds 0 to 4 used before). Per seed, run exhaustive search over the three machines (CNC router 800, laser cutter 600, casting setup 300) once with count weights and once with mass weights.
- A *flip* is a seed where the two weightings pick different machine sets. Report flips out of 20 with a 95% Wilson interval, and the *loss*: the mass-weighted coverage given up (in points) by using the count-weighted pick.
- Seeds are independent samples of the part family, so the interval covers sampling noise in the part sample only, not uncertainty in the rules or prices.

## Reproduce
```bash
pip install numpy pytest
cd research/simdesign-flipseeds
PYTHONPATH=src python3 -m pytest -q tests      # 5 tests
python3 experiments/run.py                     # writes experiments/results.txt (about 15 s)
python3 experiments/figure.py                  # writes experiments/flips.svg from results.txt
```
The sibling projects must sit next to this one in `research/`.

## Results (from `experiments/results.txt`)
- **The flips at budgets 600 to 800 are not a one-seed artefact.** Family `log`: 20 of 20 seeds flip at 600, 700 and 800 (95% interval 0.84 to 1.00). The count-weighted pick is the laser cutter in every seed; the mass-weighted pick is the casting setup in 18 of 20 seeds at 800 and the CNC router in the other 2. The mass-weighted coverage given up is 2.1 points on average (max 2.8).
- **`large` flips at exactly one budget, 800** (20 of 20, count picks the CNC router, mass picks the casting setup, 1.2 points mean loss). At 300 to 700 and 900 to 1400 it never flips in 20 seeds (upper bound 0.16).
- **`small` never flips** at any budget tested (0 of 20, upper bound 0.16).
- **The `log` flips at 1100 and 1400 are near-ties.** Half the seeds (10 of 20, interval 0.30 to 0.70) pick casting + CNC under mass weighting and casting + laser under count weighting, but the most coverage lost is 0.26 points (mean 0.04), so the choice there is not worth caring about.
- Net: the practically meaningful flips (1 to 3 points of mass-weighted coverage) occur at a few budgets in two of three families and are stable across seeds; the figure is `experiments/flips.svg`.

## Limitations
- The intervals measure sampling noise in the random part sample. The flips come from assumed prices, rules and a volume proxy, so they could move with any of those; prices at 600 to 800 sit right on the thresholds that create them (a laser at 600, a CNC at 800).
- A flip rate of 20/20 means the preference is consistent within this model, not that it is true of a real shop.
- Budgets were chosen from the earlier single-seed run (600, 800) plus 700 as a check; 1 of 7 budgets was not selected in advance. No multiple-comparison correction.
- Simulated results only; nothing was checked against a real print, cut or casting.

## Next steps
Weight by value or demand from a named parts list (`selfrep-closure`); vary the prices by ±20% to see how wide the budget bands where the choice flips are; give each machine its own bill of materials.

## Owner steps
None needed (modelling only). Machine prices are placeholders: replace them with dated quotes before using the machine choice.

## Outside dependencies (vitamins)
Open-source Python packages only (NumPy; pytest for tests). Rules, material properties and machine prices are assumptions that real shop data would replace.
