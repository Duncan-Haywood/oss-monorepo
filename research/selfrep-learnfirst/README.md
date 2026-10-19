# selfrep-learnfirst: which imported part should a printer-replicating shop learn to make first?

A new question for track 1 (`PROJECTS.md`), not a variant of the rod chain: `selfrep-alufreq` and its neighbours ask how to redesign parts; this asks which of the 29 parts the printer + router + laser shop still imports is worth learning to make, and whether the answer depends on the assumed masses and costs. Produced with AI assistance (Claude). Computed only; nothing was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-learnfirst/

**Headline (stylised, preliminary).** The answer depends on what "closure" counts. By mass or cost, the first thing to learn is the NEMA17 stepper motor (+22 points of mass closure, +26 of cost closure), and the ranking is fairly robust: it stays first in 90% (mass) and 76% (cost) of draws with every assumed mass and cost scaled 0.5x to 2x. By unit count the first is the M8 nut (+21 points), and by distinct part lines every vitamin ties at +2 points. Learning 3 lines gets +52 points of cost closure but only +39 of mass.

## Method
- Bill of materials, makers and shop from `selfrep-closure` (RepRap Prusa Mendel iteration 2, LM8UU bearing variant; printer + router + laser shop; 51 lines, 29 of them imported). Masses and costs there are assumed placeholders.
- "Learning" a line makes it makeable at no cost, so its share of total lines, units, mass or cost moves from imported to made. Gains are additive per line; each metric's ranking is a sort.
- Compared: top lines per metric, lines needed to gain 10, 25 or 50 points, Kendall tau between the metric rankings, and the gain from learning a whole kind of vitamin (rod, electronics, fastener, bearing, belt, other).
- Stability: 2,000 draws scaling every assumed mass and cost by an independent log-uniform factor in 0.5x to 2x (the range used in `selfrep-closure`); share of draws where each line ranks first, and mean Kendall tau to the nominal ranking.

## Reproduce
```bash
cd research/selfrep-learnfirst
python3 -m unittest discover -s tests -v     # 7 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
python3 experiments/figure.py                # plots the cumulative gain table to experiments/learn_curve.svg
```

## Results (from `experiments/results.txt`)
- Nominal closure of this shop: 43.1% lines, 42.1% units, 22.4% mass, 15.9% cost.
- Best first line: mass NEMA17 motor (+22.0 points), then 370 mm threaded rod (+10.4); cost NEMA17 (+26.0), controller electronics (+15.6), hot end (+10.4); units M8 nut (+21.4), M3 nut and M3x20 bolt (+10.7 each).
- Lines to learn, best first, for +50 points: 26 by lines, 9 by units, 6 by mass, 3 by cost. Ceilings if every vitamin were made: +56.9 lines, +57.9 units, +77.6 mass, +84.1 cost.
- Rankings disagree: Kendall tau mass vs cost +0.55, units vs cost -0.03, lines vs cost +0.01.
- Rank 1 under 0.5x to 2x scaling: mass NEMA17 90%, 370 mm threaded rod 10%; cost NEMA17 76%, controller 20%, hot end 4%. Mean tau to the nominal ranking 0.87 (mass) and 0.80 (cost).
- By kind: electronics carry 56 points of cost closure and 25 of mass; rods 39 of mass; fasteners 47 of units and 7 of mass.

## Limitations
- Stylised. Masses, costs and the list of what the shop can make are the assumed inputs of `selfrep-closure`; the fastener lines are wiki box sizes (100 nuts), not per-printer counts, which inflates the unit result.
- Learning is free and certain here. A real motor or controller is far harder to make than a nut or a rod, so this is an upper bound on value, not a priority list. Difficulty, time and the tooling a line needs are not modelled.
- By lines every vitamin ties; the "top" lines by that metric are alphabetical tie-breaks, not findings.
- The 0.5x to 2x perturbation keeps each line's quantity fixed and varies mass and cost independently; it is not a measured spread.

## Next steps
Give each line a learning difficulty from process data (for example, which need a winding or PCB process the shop lacks) and take the gain per unit of difficulty; combine with `selfrep-nextmachine` so a machine and the lines it unlocks are chosen together.

## Owner steps
- Weigh a few real printer parts (a motor, a rod, a nut box) to replace the assumed masses.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-closure` source tree (relative path). Everything that is imported there (motors, electronics, rods, fasteners, bearings, belts) remains imported here.
