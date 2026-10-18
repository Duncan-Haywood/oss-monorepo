# Does domain randomization over a wrong digital twin cut the controller regret of tuning on one wrong twin?

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-twinrand/

Track 11 (adversarial human imitation), side project, the follow-up that `mimic-twinregret` listed as a next step: if one wrong twin costs a tuned controller some regret on the real system, does tuning on a *spread* of twins around it recover that regret? **No LLM is used and no text is generated.** Stylised and simulated only. **Preliminary: one toy pendulum, one task, a 48-point gain grid, 24 tuning seeds.** Produced with AI assistance (Claude).

Numbers come from `experiments/results.txt` and `results.json`; the figure is `experiments/regret_vs_width.svg`.

- **Setup.** Same "real" pendulum, noisy-feedback saturating PD task, cost and regret as `mimic-twinregret` (its `twin.py` is imported, not copied). Tuning uses 200 start angles in all conditions. For width 0 they are all on the one nominal twin; for width w > 0 they are split over 8 twins whose four parameters (noise sd, Coulomb and viscous friction, g/L) are each uniform on nominal ± w × the real value, clipped at 0 (g/L at 0.1). Five nominal twins: the exact one, and four that `mimic-twinregret` found to cost something or nothing. Regret is averaged over 24 tuning seeds.
- **Randomization rescues the worst twin.** A twin with no sensor noise has regret 0.0098 at width 0 (0 of 24 seeds at zero regret). At width 0.5 it is 0.00006, and the same as tuning on the exact twin. Randomizing the noise level is what does it: the range reaches the real noise level, so the aggressive gain pair a noise-free twin rewards is penalised.
- **It rescues the friction and gravity errors too, more slowly.** No Coulomb friction: 0.00138 at width 0, 0.00046 at 0.5, 0.00012 at 1. g/L +20%: 0.00138, 0.00093 at 0.5, 0.00041 at 1, 0.00012 at 2.
- **It does not always help, and can hurt.** For a twin with doubled noise (sd ×2), regret is 0.0030 at width 0, 0.0034 at 0.25, 0.0034 at 0.5 and 0.0030 at 1. At width 2 the mean rises to 0.0057 with a worst seed of 0.042 (about 7.5 times the single-twin worst of 0.0056), though 18 of 24 seeds reach zero. The range then includes gravity down to 0.1 and friction far from the real values, and a few draws pull the tuned gains to a bad pair. A wider range is not safer.
- **Cost of randomizing when the twin is already exact:** one seed of 24 moves to a neighbouring grid point (regret 0.00146 there), mean 0.00006. The exact twin at width 0 is 0 in all seeds.
- **Reading.** Where the error is in a parameter the randomization covers and the range reaches the truth, spreading the twin recovers most of the regret. Where the range is far wider than the error, it adds variance. This is the sim-to-real argument for domain randomization (Tobin et al., 2017) seen at toy scale, with its failure mode visible.

```bash
cd research/mimic-twinrand
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests                      # 5 tests
python3 experiments/run.py                   # several minutes on 1 CPU, writes experiments/results.txt and results.json
python3 experiments/figure.py                # experiments/regret_vs_width.svg
```

## Motivation

The portfolio's theme is simulation fidelity and sim-to-real transfer. `mimic-twinregret` showed that detectability of a twin and its usefulness for a task are different things, and that regret comes mainly from noise-level errors. Domain randomization is the standard alternative to making a single twin better; this asks whether it works on a system small enough to answer on a CPU.

## Builds on

`mimic-twinregret` (system, task, regret, gain grid) and through it `mimic-twinc2st`. Tobin et al. (2017), "Domain randomization for transferring deep neural networks from simulation to the real world", IROS, for the idea; this project uses a far simpler task and makes no comparison with their results. No lab's work is built on, and no lab endorses this project.

## Method

`twinrand.py`: `draw_twin` samples a randomized twin; `tune_dr` grid-searches PD gains on the mean cost over 8 twins with 25 start angles each, the same 200-angle budget as `twin.tune`. `experiments/run.py` computes one held-out real-system evaluation (2,000 start angles) per seed and shares it by every condition, so regret differences across conditions come only from the tuning.

## Limitations

One system, one task and a 48-point grid, so regret is quantised: it is the same grid point or a neighbour. That is why several conditions print identical numbers (the exact twin and the no-noise twin at width ≥ 0.5 pick the same gains in the same seeds, because the two random streams are the same and the optimum is flat). Randomization is one family, uniform on all four parameters at once with a shared width, centred on a wrong nominal: it never randomizes just the parameter that is wrong, and the ranges at width 2 are extreme. The range is not tuned and no adaptive method (for example, narrowing the range from real data) is tried. Regret is the mean of 24 seeds; the sd column shows it is noisy for the mid-range conditions. Nothing here is a claim about a physical pendulum or about learned policies.

## Next steps

Randomize only the noise level; learn the randomization range from a small real sample; a task where friction matters (swing-up).

## Owner steps

None.

## Outside dependencies

numpy, scipy, scikit-learn (through `mimic-twinregret`), matplotlib (figure only). Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
