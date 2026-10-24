# simdesign-coverweight: does weighting parts by mass change which shop process, and which machine, matters?

Seventh project of the simulation-first design track (`PROJECTS.md`, track 5), taking the first "next step" of [`simdesign-processcover`](../simdesign-processcover): a cheap plastic part should not count as much as a heavy one. Produced with AI assistance (Claude). Everything here is stylised: the DFM rules, material properties and machine prices are the **assumed** round numbers of `simdesign-processcover`, `simdesign-dfm` and `selfrep-nextmachine`, the part family is a random sample, and the mass weight is a crude proxy. Simulated result only; no part was made.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-coverweight/

**Builds on.** `research/simdesign-processcover` (rules, part sampler and `feasible`, imported unchanged) and `research/selfrep-nextmachine` (`exhaustive` and `greedy`, imported unchanged). Both build on `simdesign-dfm` and `simdesign-bracket`. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Same part family, processes, load check and 20 000-part samples (seeds 0 to 4) as `simdesign-processcover`.
- *Count weighting* gives every part weight 1/n (the original). *Mass weighting* gives part i the weight w·b·L / Σ w·b·L, the arm volume times one common density. This **assumes every part is the same material**, so it is a proxy for "heavy parts matter more", not a real mass or value. Coverage is then the weight of parts some process in the shop can make.
- Machine choice reuses `exhaustive` and `greedy` with weighted coverage as the value and the same assumed prices (CNC router 800, laser cutter 600, casting setup 300), on seed 0 only.

## Reproduce
```bash
pip install numpy pytest
cd research/simdesign-coverweight
PYTHONPATH=src python3 -m pytest -q tests      # 8 tests
PYTHONPATH=src python3 experiments/run.py      # writes experiments/results.txt (a few seconds)
python3 experiments/figure.py                  # writes experiments/coverage.svg from results.txt
```
The sibling projects must sit next to this one in `research/`.

## Results (from `experiments/results.txt`)
- **Heavy parts are easier to cover, so mass weighting raises coverage for most processes.** Family `log` with a tip load: FDM alone covers 0.300 of parts counted equally and 0.583 by mass; casting 0.218 and 0.461; CNC 0.160 and 0.258; laser 0.178 and 0.178 (unchanged). A plausible cause, not tested here: large sections are stiffer and carry the load check, while the many thin small parts fail it. Without a load, FDM goes from 0.893 to 0.971.
- **The process ranking changes.** On `log` with load, laser beats CNC by count (0.178 vs 0.160) and CNC beats laser by mass (0.258 vs 0.178). On `large` with load, CNC leads laser under both weightings (0.408 vs 0.280 by count, 0.325 vs 0.181 by mass), so there the order holds.
- **The machine choice changes at some budgets.** `log` with load, seed 0: at budgets 600 and 800 exhaustive search picks the laser cutter by count (0.374) but the casting setup by mass (0.661). On `large` with load at budget 800 it picks the CNC router by count (0.778) but the casting setup by mass (0.826). At 300 and from 900 up the weightings agree (`large`, 1100 to 1400: casting + router either way). In the `small` family the choice is the same under both weightings.
- **Greedy is still sometimes beaten, and mass weighting does not remove that.** By mass, greedy (casting + laser, 0.855) loses to exhaustive (casting + router, 0.863) at `large` budgets 1100 to 1400. The gaps are under one coverage point and one seed.
- **Geometry alone stays degenerate.** With no load FDM covers everything the other processes can, so no machine adds coverage under either weighting (negative result carried over).

## Limitations
- The mass proxy is volume at one density. A real shop would weigh by material, mass, value or demand, and plastic and metal parts differ. Because the weight grows with w and b, which also decide whether the load check passes, the shift partly restates that correlation.
- All rules, stresses, prices and the random part family are assumptions inherited from the earlier projects; the numbers are not estimates of any real shop.
- Machine choice is for one seed and three machines; differences of about a point are not tested for significance, and the budget flips above are single-sample findings.
- Simulated results only; nothing was checked against a real print, cut or casting.

## Next steps
Weight by value or demand from a named parts list (the real part lists of `selfrep-closure`); test the flips at budgets 600 to 800 across seeds with an interval; give each machine its own bill of materials.

## Owner steps
None needed (modelling only). Machine prices are placeholders: replace them with dated quotes before using the machine choice.

## Outside dependencies (vitamins)
Open-source Python packages only (NumPy; pytest for tests). Rules, material properties and machine prices are assumptions that real shop data would replace.
