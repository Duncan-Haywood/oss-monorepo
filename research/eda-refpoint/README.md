# eda-refpoint: does the ranking of design-search proposers survive a change of hypervolume reference point, scaling or quality indicator? (follow-up to `eda-proposers`, track 7)

Why it seemed worth doing: `eda-proposers` ranked six search methods by hypervolume at one reference point (1.1 on min-max scaled objectives), and every later track-7 project reuses that metric. Hypervolume is known to depend on the reference point, so this re-scores the *same* 100-seed runs under five reference points, fraction-of-front recall, IGD+ and the additive epsilon indicator, and a log scale for cell counts. Produced with AI assistance (Claude). **Stylised and preliminary:** one 80-design accelerator table, generic-gate cell counts, no place and route.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-refpoint/

**Builds on.** `research/eda-proposers` (table, six proposers and runner, imported unchanged; only scoring is new). IGD+: Ishibuchi, Masuda, Tanigaki and Nojima (2015), EMO. Hypervolume as an indicator: Zitzler and Thiele (1999), *IEEE TEC* 3(4). Sensitivity to the reference point: Ishibuchi et al. (2018), GECCO, "How to specify a reference point in hypervolume calculation" (cited from memory, not re-read). No CU Boulder lab's work is built on.

## Result
- **Where `eda-proposers` found a winner, every indicator agrees.** At budget 16 and 30, TPE has the best mean under all eight indicators (one exception: at 30 with reference point 5.0, NSGA-II ties it at 0.997). Kendall tau of the five-method order against the reference-1.1 order is +1.00 for hypervolume at reference points 1.01 to 2.0, and between +0.20 (recall, budget 16) and +0.80 for IGD+, epsilon and recall.
- **The size of TPE's lead depends strongly on the reference point.** Mean paired gain over random at budget 30: +0.045 (ref 1.01), +0.037 (1.1), +0.019 (1.5), +0.010 (2.0), +0.002 (5.0). The share of seeds where TPE is better stays high at 30 (0.92, 0.92, 0.94, 0.91, 0.76), so the *direction* is robust and the *magnitude* is not. Distant reference points reward the extreme designs that any search finds.
- **Recall and IGD+ show a bigger gap than hypervolume.** At budget 30 TPE finds 0.635 of the true front's points against random's 0.356 (+0.279; better on 92% of paired seeds, worse on 5%), and IGD+ better on 97%.
- **At budget 8 the ranking is not stable.** TPE, NSGA-II and random are the same runs there (shared initial draw), so they tie under every indicator and the "best" column is decided by annealing and the genetic method. Annealing is worst under hypervolume and best by front recall (0.106 against 0.098), so the choice of indicator flips its rank at small budgets.
- **Log-scaling cell counts keeps the order at budgets 16 and 30** (tau +1.00); levels drop (TPE 0.959 against 0.980 at 30) because the log compresses the cell axis.

Full tables: `experiments/results.txt`. Figure: `experiments/tpe_vs_random.png`.

## Reproduce
```bash
pip install numpy matplotlib
cd research/eda-refpoint
PYTHONPATH=src python -m unittest discover -s tests      # 6 tests
PYTHONPATH=src python experiments/run.py                 # several minutes; writes experiments/results.txt
python experiments/figure.py
```

## Limitations
- One 80-design table and five untuned proposers; with a space this small, differences between indicators are partly about how few front points exist (12).
- Only the reference point, scaling and indicator vary; proposers, seeds and table are fixed, so this says nothing about other spaces.
- Cell counts are Yosys generic-gate counts (version 0.33, recorded in `results.txt`), not area; nothing here is a claim about silicon.
- The reference-point citation above was not re-read.

## Next steps
Report a reference-point sweep alongside any future hypervolume table; repeat on a larger or noisy space; try a nadir-based reference point computed from the found set.

## Owner steps
None.

## Outside dependencies
None to run (NumPy; matplotlib for the figure). Needs `research/eda-proposers` in the tree. All code original, MIT.
