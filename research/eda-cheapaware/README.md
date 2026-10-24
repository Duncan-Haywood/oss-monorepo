# eda-cheapaware: how much of the surrogate screen's lead over random search comes from the free objectives, and what does a random search that uses them reach? (follow-up to `eda-screen`, track 7)

Why it seemed worth doing: `eda-screen` listed one gap in its own limitations, that a fair "cheap-aware" random baseline (random among designs not dominated on the free objectives) was not run, so its +0.130 lead over random was only split by an ablation. Here that baseline is run on the same 80-design accelerator table and the same 100 seeds. Produced with AI assistance (Claude). **Stylised and preliminary:** one 80-design space from one toy accelerator, generic-gate cell counts, no place and route, and a screen that interpolates inside one family.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-cheapaware/

## Result
A random search that gets the same free objectives (cycles, held-out error) as the screen but has no cell-count model reaches 0.901 of the true front's hypervolume at 12 syntheses (95% bootstrap interval 0.901 to 0.901; 100 seeds), against 0.860 for plain random, 0.878 for TPE and 0.990 for the screen with 4 fitting syntheses. So of the screen's +0.130 over random at 12, using the free objectives alone is worth +0.041 (cheap-aware random better than random on 74% of paired seeds), and the cell-count surrogate is worth the other +0.089.

The cheap-aware baseline is stronger than random only at small budgets. It synthesises the free-objective Pareto layer first, and once that layer is exhausted (by 12 syntheses the interval is degenerate) it starts the next layer at random and stalls at 0.901 until 20, where plain random catches up (0.911) and TPE passes it (0.944). At 30 it is *below* both (0.933 against random 0.943 and TPE 0.980), because the layers it prefers hold designs that never reach the front. It reaches the whole true front on none of the seeds even at 30. The screen reaches it on 87% of seeds by 20.

| syntheses | random | TPE | cheap-aware random | screen, k=4 | free objectives only (ordered) | oracle |
|---|---|---|---|---|---|---|
| 4 | 0.700 | 0.700 | 0.777 | 0.654 | 0.743 | 0.975 |
| 8 | 0.815 | 0.815 | 0.851 | 0.951 | 0.901 | 0.996 |
| 12 | 0.860 | 0.878 | 0.901 | 0.990 | 0.908 | 1.000 |
| 20 | 0.911 | 0.944 | 0.901 | 1.000 | 0.908 | 1.000 |
| 30 | 0.943 | 0.980 | 0.933 | 1.000 | 0.908 | 1.000 |

(Mean hypervolume found / true hypervolume; the full table with intervals, k=6 and k=8 columns and paired differences is `experiments/results.txt`; figure `experiments/cheapaware_hv.svg`.) The "ordered" column is `eda-screen`'s `cheaponly`, which breaks ties between equally ranked designs by distance to the origin instead of at random; it is deterministic, so its intervals are degenerate. The random-tie-breaking version here is slightly lower at 12 (0.901 against 0.908).

## Method
- **Space and table.** Copied unchanged from `eda-screen` (itself copied from `research/eda-proposers`): 80 designs (lanes p 1..8, weight width 4..8 bits, ABC script `abc -g` or `abc -fast -g`), three minimised objectives (Yosys cell count, cycles per inference, 1 minus held-out accuracy) normalised to [0, 1]; hypervolume reference (1.1, 1.1, 1.1); true front 12 of 80 designs. Budget is the number of Yosys syntheses; cycles and error are free for the screen and the cheap-aware baseline.
- **Cheap-aware random** (`CheapRandom` in `src/eda_cheapaware/screen.py`). Rank all 80 designs by non-dominated sorting (Deb et al., 2002, *IEEE TEC* 6(2):182) on (cycles, error) alone. Each step, draw uniformly from the unmeasured designs in the best layer that still has any. Measured cell counts are never read.
- **Everything else** (screen, random, TPE, hypervolume (Zitzler and Thiele, 1999, *IEEE TEC* 3(4):257), the equal-synthesis runner) is the `eda-screen` code, copied. 100 seeds per stochastic method.

## Reproduce
```bash
pip install numpy
cd research/eda-cheapaware
PYTHONPATH=src python -m unittest discover -s tests     # about a second
PYTHONPATH=src python experiments/run.py                # about a minute; writes results.txt
python experiments/figure.py                            # draws experiments/cheapaware_hv.svg
```

## Limitations
- One small, smooth, 80-point space; the free-objective layers happen to hold about a dozen designs, which is why the baseline plateaus at 12. In a space where cycles and error do not separate designs, the baseline reduces to plain random.
- The free-objectives assumption (cycles and error cost nothing to evaluate) is inherited from `eda-screen` and not measured here.
- A stronger cheap-aware baseline is possible (for example TPE restricted to the free-objective layers); only this one simple version was run, so "the surrogate is worth +0.089" is relative to it.
- Cell count is Yosys generic cells; the `-fast` rows were not gate-level re-simulated (inherited). Not a claim about silicon.

## Next steps
TPE restricted to the cheap layers; run the screen with a surrogate trained on other families only (`eda-adapt`'s setting) on a larger, rougher space; repeat with a post-route target once OpenROAD is available.

## Owner steps
None.

## Outside dependencies
None to run (NumPy). The table was produced with Yosys 0.33 in `eda-proposers`. All code original except the copied `hv.py`, `proposers.py`, `screen.py` base and table, all MIT.
