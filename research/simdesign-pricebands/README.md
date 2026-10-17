# simdesign-pricebands: how wide are the budget bands where mass weighting changes the machine choice when prices are uncertain?

Ninth project of the simulation-first design track (`PROJECTS.md`, track 5), taking the "vary the prices by ±20%" next step of [`simdesign-flipseeds`](../simdesign-flipseeds): its flips sat exactly on the budget thresholds created by the assumed prices (a laser at 600, a CNC router at 800), so the flip may be an artefact of those round numbers. Produced with AI assistance (Claude). Everything here is stylised: DFM rules, material properties and machine prices are the **assumed** round numbers of the earlier projects, the part family is a random sample and the mass weight is a crude same-material volume proxy. Simulated result only; no part was made.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-pricebands/

**Builds on.** `research/simdesign-flipseeds` (`MACHINES`), `research/simdesign-coverweight` (`sample_parts`, `weights`, `wshop_value`), `research/selfrep-nextmachine` and `research/simdesign-processcover`, imported unchanged. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Per family (`log`, `large`, `small`, tip load) and part sample (8 samples of 20 000 parts, seeds 5 to 12, a subset of flipseeds' seeds), compute the count-weighted and mass-weighted coverage of each of the 8 machine subsets once. Coverage does not depend on price, so prices can be changed afterwards without re-simulating.
- Draw 400 price vectors, each machine's price (800, 600, 300) multiplied by an independent U(1−s, 1+s) factor, for s = 0 (nominal), 0.1 and 0.2. The same draws are used for every sample and budget (draw seed 0).
- For each (sample, draw, budget) pick the best affordable subset under each weighting (ties go to the cheaper set). *any* = share of cases where the two picks differ. *mat* (material) = share where the count-weighted pick gives up more than 0.5 points of mass-weighted coverage; the 0.5-point threshold is my choice, not from the literature.
- A test checks that at nominal prices the picks and coverages equal `simdesign_flipseeds.choice`.

## Reproduce
```bash
pip install numpy pytest
cd research/simdesign-pricebands
PYTHONPATH=src python3 -m pytest -q tests      # 5 tests
python3 experiments/run.py                     # writes experiments/results.txt (about 17 s)
python3 experiments/figure.py                  # writes experiments/pricebands.svg from results.txt
```
The sibling projects must sit next to this one in `research/`.

## Results (from `experiments/results.txt`; figure `experiments/pricebands.svg`)
- **The `log` flip band widens but also softens.** At nominal prices the material flip occurs at budgets 600 to 800 in every case and nowhere else on the grid (300 to 1500 step 100). With ±20% prices it spans 500 to 1000 (0.05 at 500, 0.48 at 600, 0.93 at 700, 0.92 at 800, 0.53 at 900, 0.07 at 1000). The sharp 600 and 900 edges are exactly where nominal prices put threshold effects; perturbing them turns 0/1 into about one half.
- **`large` is the most price-fragile.** Nominally it flips only at 800 (1.00). With ±10% prices that becomes 0.47 at 800 and 0.53 at 900; with ±20% it is 0.20 at 700, 0.44 at 800, 0.41 at 900 and 0.07 at 1000. So at the one nominal flip budget, the flip happens in under half the price draws, and a shop with a 900 budget would see it in about two-fifths of them.
- **`small` never flips** at any spread or budget on the grid.
- **The near-tie flips at 1100 to 1500 in `log`** (any = 0.38) are never material (mat = 0.00 at nominal and ±10%, and 0.00 at ±20% for 1100 and beyond); counting them as disagreements would overstate the effect.
- Net: whether weighting by mass should change the machine choice is robust in `log` for budgets of roughly 700 to 800 and fragile elsewhere; claims of a specific flip budget in the earlier projects should be read as bands, with the edges blurred by price uncertainty of this size.

## Limitations
- Prices are perturbed independently and uniformly, which is arbitrary; real quotes are correlated and skewed. The 400 draws are shared across the 8 part samples, so the shares carry no confidence interval and the samples are not independent price experiments.
- The budget grid is 100 wide, so band edges are only known to about that resolution.
- The 0.5-point materiality threshold is a choice; other thresholds change which shares are called material.
- Only prices were varied; rules and the mass proxy are still the assumed ones. Simulated only; nothing was checked against a real print, cut or casting.

## Next steps
Weight by value or demand from a named parts list (`selfrep-closure`); correlate the price draws (a common inflation factor); give each machine its own bill of materials.

## Owner steps
None needed (modelling only). Machine prices are placeholders: replace them with dated quotes before using the machine choice.

## Outside dependencies (vitamins)
Open-source Python packages only (NumPy; pytest for tests). Rules, material properties and machine prices are assumptions that real shop data would replace.
