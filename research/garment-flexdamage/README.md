# garment-flexdamage: does it matter *where* an RF-shielding fabric is damaged?

Follow-up to the "correlated damage" and "more draws with confidence intervals" next steps of [`garment-contactres`](../garment-contactres), which itself follows [`garment-optics`](../garment-optics). A two-layer resistor-network model of a conductive woven fabric (warp and weft touch only through a contact resistor at each crossing) with two kinds of non-independent damage: contacts that wear where yarns break, and breaks that cluster in a fold band. Everything is a model on a CPU; no fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-flexdamage/

**Builds on.** `research/garment-contactres` and `research/garment-optics` in this repository (network, units and the thin-sheet shielding framing; their READMEs list their own sources). The network code is copied, not imported, so this project stays self-contained. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. No new external source is used, so there are no new citations.

## Method (`src/garment_flexdamage/model.py`)
- Network as in `garment-contactres`: weft node and warp node per crossing joined by a contact resistor `rc`; yarn segments have resistance 1; bus bars on the left and right weft ends; warp ends open; result is the effective sheet resistance in units of one segment, `R_total * n / (n - 1)`. A draw with no path is "open".
- **Worn contacts.** A crossing touching a broken yarn segment has contact resistance `rc * k`. `k = 1` is the independent model of `garment-contactres`. The multiplier is a stand-in for coating wear that accompanies a break, not a measured relationship.
- **Fold band.** A band covering 20% of the fabric (columns for a fold across the current direction, rows for one along it) breaks with probability `conc * f`; outside the band the probability is lowered so the mean per-cell break probability stays `f`. `conc = 1` is uniform. (The last column of weft and last row of warp have no segment, so the realised broken fraction is slightly below `f` in every cell of every table, including `conc = 1`.)
- 24 x 24 fabric, 60 draws per cell, seed 0, median of conducting draws with a 95% bootstrap interval (1000 resamples, seeded).

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-flexdamage
python3 -m pytest -q tests          # 9 tests
python3 experiments/run.py          # about 15 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- **Worn contacts raise resistance, with diminishing return at low breakage.** With base `rc` = 1 segment and independent breaks, the median at 20% broken is 2.05 (k = 1), 2.40 (k = 3), 3.03 (k = 10) and 3.71 (k = 30). At 30% broken: 3.43, 4.47, 6.88, 11.15. At 10% broken the effect of k = 10 is 1.38 to 1.63.
- **Good contacts that wear badly are less affected.** With base `rc` = 0.1, k = 10 at 20% broken gives 1.99 against 1.75 (k = 1).
- **Clustering matters more than wear in this model.** A fold band *across* the current direction, holding the mean break fraction fixed, raises the median at 20% broken from 2.05 (conc 1) to 2.64 (conc 2), and at conc = 4 leaves 57 of 60 draws open (the 3 that conduct have median 12.2, a poor summary). At 30% broken and conc = 2, 14 of 60 draws are open; at conc = 4 all are. The same band *along* the current direction goes the other way: at 20% broken the median falls from 2.05 to 1.94 (conc 2) and 1.43 (conc 4), because breaks concentrate in a few rows and the remaining rows stay intact.
- The ideal-contact table (D) shows the same pattern at lower values (across, 20% broken: 1.71, 2.08 and 9.25 for conc 1, 2 and 4, against 2.05, 2.64 and 12.2 with rc = 1), so the fold effect is mostly a network-geometry effect rather than a contact effect.
- Cross-check: with `k = 1`, `conc = 1`, `rc` = 1 at 20% broken the median is 2.05 here (24 x 24) against 2.11 in `garment-contactres` (30 x 30, 20 draws, different random order and break rule). That fits finite-size and sampling differences; I did not test it.
- Stylised reading, not a claim about real fabric: the position of damage can change the answer by more than the contact wear does, so a flex test that records only the broken fraction is incomplete.

## Limitations
- Square lattice, identical segments, one lattice size, contacts that change only through the `k` rule; `k` and `conc` are swept values with no measurement behind them. No yarn crimp, pressure-dependent contact, near field, or aperture term. Results are sheet resistance only; I did not convert to dB here.
- The fold band is one rectangular band with sharp edges; real flex damage depends on bending radius, cycles and fibre type, none of which are modelled.
- Medians for open-heavy cells (marked "open") use a handful of conducting draws and should be read as indicative only.

## Next steps
Find a sourced range for crossing resistance and wear to place a real fabric on these maps; drive damage from a flexing-cycle model instead of a fixed break fraction; add the aperture bound and compare with a published swatch measurement; larger lattices to check size dependence.

## Owner steps
Flex a swatch over a fixed radius for increasing cycles and record the four-wire resistance across it and of single crossings near a break, which would give `k` directly. No bill of materials or prices are given: I have no dated, sourced price list.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest.

## References
- `research/garment-contactres` and `research/garment-optics` in this repository.
