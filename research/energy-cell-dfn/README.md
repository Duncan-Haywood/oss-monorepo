# energy-cell-dfn: do the lithium-ion cell designs found with a fast model still win under the full porous-electrode model?

Track 16 (`PROJECTS.md`), a fidelity check on [`energy-cell`](../energy-cell), taking its first "Next step" (check the winners against a DFN model). `energy-cell` searched four electrode numbers with PyBaMM's single-particle model with electrolyte (SPMe). Here 49 of its designs (the baseline, the best design of each search run, 36 spread evenly over its SPMe ranking, and 3 designs SPMe could not cycle) are re-scored under the full Doyle-Fuller-Newman model (DFN), with the same parameters, protocol and mass model. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/energy-cell-dfn/

**Headline (modelled, stack level, one parameter set; not a tested cell).** Over the 45 designs both models could cycle, the two models rank cycle-100 energy per kilogram with Spearman correlation **0.86** (0.93 at beginning of life). The SPMe winner (143.4 Wh/kg, a session proposal) is still near the top under DFN: **3rd of 45**, at 160.9 Wh/kg against a DFN best of 163.0 for another design. The design gain survives: the SPMe winner beats the reference cell by **+31% under SPMe and +38% under DFN**. DFN reports more energy than SPMe for almost every design (mean +18.6 Wh/kg, median relative gap 9%), and the gap is far larger for a few designs (up to +127 Wh/kg). SPMe could not cycle 3 designs that DFN cycled normally.

**Builds on.** `research/energy-cell` (code imported unchanged: parameters, mass model, bounds, logged designs); the DFN model of Doyle, Fuller and Newman (1993), *J. Electrochem. Soc.*, and the SPMe reduction as implemented in PyBaMM (Sulzer et al. 2021, *J. Open Research Software*); the `OKane2022` parameter set (O'Kane et al. 2022, *Phys. Chem. Chem. Phys.*). Citations were not re-fetched in this run; check them before reuse. No group in `prompt.md` covers battery design, and none is claimed.

![SPMe against DFN energy at cycle 100](experiments/scatter.svg)

## Method
- `experiments/run.py select` picks the designs deterministically from `energy-cell/experiments/auto.json` and `session.json` (`selected.json`).
- `run.py dfn` scores each under DFN and SPMe with one protocol (100 cycles, 5 A discharge to 2.5 V, 5 A charge to 4.2 V, solvent-diffusion-limited SEI and irreversible lithium plating; score = discharge Wh at cycle 100 per kg of stack). The SPMe baseline reproduces `energy-cell`'s 109.1 Wh/kg (a test checks it). DFN needed 4 to 13 GB of memory per design and did not release it, so each design runs in a fresh process (about 35 s each). Per-design results are in `experiments/dfn.jsonl`.
- `run.py report` writes `experiments/results.txt`; `figure.py` draws the scatter from it.

## Results
See `experiments/results.txt` (sections A to C; every design is listed). In short:
- Baseline: SPMe 109.1, DFN 116.3 Wh/kg at cycle 100.
- The top SPMe designs (140-143 Wh/kg) span roughly 154 to 163 Wh/kg under DFN, so the near-plateau that `energy-cell` found is not flat under DFN: DFN would pick a different design from within it (115 µm, porosities 0.38 / 0.28, N/P ratio 1.3, at 163.0).
- The large disagreements are on designs SPMe scores low or zero: one scores 27.6 under SPMe and 129.9 under DFN. The cause was not investigated.

## Limitations
- 49 designs, one cell, one parameter set, one protocol. The designs were chosen to spread across the SPMe ranking, so the correlation is not the one over the whole search space or over what a search visits.
- Both models use the same degradation submodels and the same parameters; DFN giving more energy is not evidence that it is closer to a real cell. No measured data is used, so neither model is validated here.
- Stack-level mass only (no casing or tabs), as in `energy-cell`.

## Next steps
Run a search directly on DFN with the same budget to see whether it finds a different optimum than the one picked from SPMe; investigate the three SPMe failures and the largest gaps; compare both models with measured discharge curves.

## Reproduce
`python experiments/run.py select|dfn|report`, then `python experiments/figure.py` (needs numpy, scipy, pybamm; `dfn` needs a lot of RAM headroom and takes about 30 minutes). Tests: `pytest research/energy-cell-dfn/tests`.

## Outside dependencies
PyBaMM and its parameter data. Cell fabrication, cycling and measured parameters are owner steps.
