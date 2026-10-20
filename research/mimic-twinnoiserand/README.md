# Does randomizing only the sensor-noise level of a wrong digital twin keep domain randomization's rescue without its blow-up?

Track 11 (adversarial human imitation), side project, the first "next step" of `mimic-twinrand`: that project randomized all four twin parameters at once and found that a wide range sometimes made regret worse (worst seed 0.042 at width 2). Here only the noise sd is randomized. **No LLM is used and no text is generated.** Stylised and simulated only. **Preliminary: one toy pendulum, one task, a 48-point gain grid, 24 tuning seeds.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-twinnoiserand/

Numbers come from `experiments/results.txt` and `results.json`; the figure is `experiments/regret_vs_width.svg`.

- **Setup.** Same real pendulum, task, cost, regret, gain grid, five nominal twins, 8 twins x 25 start angles and seeds as `mimic-twinrand` (its module is imported). "Noise only": the twin's noise sd is uniform on nominal ± width × 0.02 (clipped at 0); friction and g/L stay at the nominal twin's values. "All four" is `mimic-twinrand`'s scheme, re-run here with the same seeds and held-out evaluations. Widths 0, 0.5, 1, 2, 4.
- **Noise-only still rescues the no-noise twin, and does not blow up.** Regret 0.0098 at width 0, 0.0008 at 0.5, 0.0004 at 1, 0 (24 of 24 seeds) at 2, and 0.00035 at 4 (worst seed 0.0015). All-four reaches 0.00006 already at 0.5, so it is faster here, but at width 4 its worst seed is 0.042 against 0.0015.
- **It helps a twin with doubled noise, where all-four did not.** Noise sd ×2: 0.0038 at width 0, 0.0029 at 1, 0.0017 at 2, 0.0012 at 4 (worst seed 0.0016). All-four goes 0.0030, 0.0030, 0.0057, 0.017. Randomizing the sd across a range that includes the true value is what helps; adding friction and gravity spread is what hurt.
- **It cannot fix errors in parameters it does not randomize.** No Coulomb friction and g/L +20% stay at 0.00138 at every width, exactly the single-twin regret. All-four reduced these to 0.00012.
- **Cost on the exact twin.** Noise-only regret is 0.00005 up to width 1, 0.0004 at 2 and 0.0008 at 4 (11 of 24 seeds at zero): a wide noise range pulls a few seeds to a neighbouring grid point. This is small beside all-four's 0.007 at width 4.
- **Reading.** Randomization is as safe as the parameters you spread: spreading just the one that is wrong (and whose range reaches the truth) gives the benefit at a small and bounded cost; spreading the ones that are not wrong adds variance. It is useless for the parameters left alone. This needs knowing which parameter is wrong, which a real user would not.

```bash
cd research/mimic-twinnoiserand
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests                      # 4 tests
python3 experiments/run.py                   # ~2.5 minutes on 1 CPU, writes experiments/results.txt and results.json
python3 experiments/figure.py                # experiments/regret_vs_width.svg
```

## Motivation

The portfolio's theme is simulation fidelity and sim-to-real transfer. `mimic-twinrand` showed domain randomization can rescue a wrong twin and can also hurt. This isolates which part of the spread helps and which hurts.

## Builds on

`mimic-twinrand` (randomization scheme, budget, evaluation), `mimic-twinregret` (system, task, regret), and Tobin et al. (2017), "Domain randomization for transferring deep neural networks from simulation to the real world", IROS, for the idea. No lab's work is built on, and no lab endorses this project.

## Method

`twinnoiserand.py`: `draw_twin_noise` and `tune_noise_dr`, with the same budget (200 start angles over 8 twins) as `twinrand.tune_dr`. `experiments/run.py` runs both schemes on the same seeds and shared held-out evaluations.

## Limitations

One system, one task and a 48-point grid, so regret is quantised and several rows are identical. Width 0 is not a shared baseline: the two schemes consume the random stream differently, so their width-0 rows differ slightly (for example 0.0038 vs 0.0030 for noise sd ×2, and 0.00005 vs 0 for the exact twin); read that gap as sampling noise of the size of one grid step. Width units differ by parameter, so "width 2" is not the same range as in the all-four scheme. Only the noise level is isolated; friction-only or gravity-only randomization is not run. No range is learned from data. Nothing here is a claim about a physical pendulum or learned policies.

## Next steps

Randomize each parameter alone to see which spreads help for which error; learn the range from a small real sample; a task where friction matters (swing-up).

## Owner steps

None.

## Outside dependencies

numpy, scipy, scikit-learn (through `mimic-twinregret`), matplotlib (figure only). Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
