# Proposal: a predictive theory of low-communication training

Programme `lowcomm-training`, opened 2026-10-24. Written with AI assistance
(Claude Code). This is a plan, not a result: nothing below has been measured
on a neural network yet. Claims about our own earlier projects cite those
projects; every claim about outside work is a reading of the abstract and
needs the reference opened before it goes into a paper (see "Citation status").

## Question

Which of the sync interval `H`, the number of workers `M`, update compression,
outer-update delay, outer momentum and the aggregation rule sets the final
loss of DiLoCo-style low-communication training, and can a model with a few
measured constants per model size predict the final loss of a configuration it
has not seen, from the structure of the algorithm rather than from a
curve fitted to hundreds of runs?

It is open because the two bodies of work do not meet. Theory for local SGD
bounds convergence on convex or smooth objectives with constants nobody
measures. The empirical scaling laws for DiLoCo (Charles et al., 2025) fit loss
as a power law in model size and `M`, `H`, but do not say *why* one axis costs
more than another, so they cannot be reused when a new axis (a compressor, a
delayed outer step) is added.

## Why it matters

Training across data centres or over consumer links is limited by bandwidth,
and DiLoCo-style methods cut communication by orders of magnitude (Douillard
et al., 2023; Douillard et al., 2025; Jaghouar et al., 2024). Choosing `H`,
the compressor and the outer optimiser is today a sweep at every scale. A
predictive model that says "this compressor costs this much loss at this
sync interval" lets a team pick a configuration from one pilot run and tells
a method designer which axis is worth work. If the model fails, the failure is
informative too: it says which part of the quadratic picture breaks on real
networks.

## Related work

Local SGD theory:
- Stich, "Local SGD converges fast and communicates little", 2018, arXiv:1805.09767. Convex rates with `H` growing as `√T`; does not cover compression, delay or outer momentum.
- Khaled, Mishchenko, Richtárik, "Tighter theory for local SGD on identical and heterogeneous data", 2020, arXiv:1909.04715. Sharper bounds and the effect of heterogeneity; bounds, not predictions of a loss value.
- Woodworth et al., "Is local SGD better than minibatch SGD?", 2020, arXiv:2002.07839. Shows when local SGD does and does not beat minibatch SGD; worst-case, convex.
- Wang and Joshi, "Cooperative SGD: a unified framework for the design and analysis of communication-efficient SGD algorithms", 2018, arXiv:1808.07576. One framework for periodic averaging, decentralised and elastic variants; no outer optimiser or compressor.
- Lin et al., "Don't use large mini-batches, use local SGD", 2018, arXiv:1808.07217. Empirical case for local SGD on deep nets and the post-local-SGD switch; no predictive model.

Federated and outer optimisers:
- McMahan et al., "Communication-efficient learning of deep networks from decentralized data", 2016, arXiv:1602.05629. FedAvg; the template for the inner/outer split.
- Reddi et al., "Adaptive federated optimization", 2020, arXiv:2003.00295. Server-side Adam and Yogi on pseudo-gradients; convergence results and tuning on small tasks, not language models.
- Karimireddy et al., "SCAFFOLD: stochastic controlled averaging for federated learning", 2019, arXiv:1910.06378. Corrects client drift; a different remedy for the heterogeneity our quadratic model treats as bias.
- Wang et al., "SlowMo: improving communication-efficient distributed SGD with slow momentum", 2019, arXiv:1910.00643. Outer momentum on top of local SGD; shows it helps, does not predict the optimal momentum as `H` changes.

Low-communication language-model training:
- Douillard et al., "DiLoCo: distributed low-communication training of language models", 2023, arXiv:2311.08105. The algorithm: AdamW inner, Nesterov outer; empirical only.
- Douillard et al., "Streaming DiLoCo with overlapping communication", 2025, arXiv:2501.18512. Partial-parameter sync, overlap and quantised deltas; ablations, no model of the cost of delay.
- Jaghouar et al., "OpenDiLoCo", 2024, arXiv:2407.07852. Open replication at 1.1B parameters over the internet; our reference for a public baseline.
- Charles et al., "Communication-efficient language model training scales reliably and robustly: scaling laws for DiLoCo", 2025, arXiv:2503.09799. The strongest empirical baseline: fitted laws for loss against size, `M` and `H`. Our scaling-law baseline.

Compression and scaling laws:
- Vogels, Karimireddy, Jaggi, "PowerSGD: practical low-rank gradient compression for distributed optimization", 2019, arXiv:1905.13727. A compressor that works on deep nets with error feedback; no loss-floor prediction.
- Hoffmann et al., "Training compute-optimal large language models", 2022, arXiv:2203.15556. Form of the loss-versus-size law used as the fitted baseline.
- Kaplan et al., "Scaling laws for neural language models", 2020, arXiv:2001.08361. The original loss power laws, and the critical-batch-size idea behind our noise constant.

Our own earlier work (prior work in this repository; each is a closed-form
result on a quadratic, checked against simulation, not a neural network):
`local-sgd-bias` (fixed point and sync-interval trade-off), `outer-momentum`
(per-mode rates, optimal momentum falls with `H`, `H* ≈ C`), `noisy-local-sgd`
(exact stationary loss, independent of `H` at outer step 1), `compressed-outer`
and `compressed-sync` (floor inflated by `1+ω`), `error-feedback-sync` and
`sparse-outer-sync` (error feedback), `delayed-outer` and `outer-delay`
(stability iff `αs < 2 sin(π/(4τ+2))`), `robust-outer` (median costs `π/2` in
variance), `partial-participation`.

## Gap

Charles et al. predict the loss of DiLoCo as a function of size, `M` and `H`
with an empirical law. The projects above derive, on a quadratic with gradient
noise, how compression, delay, outer momentum and aggregation each change the
stationary loss and the stability limit. Nobody has tested whether those
derived *structural* factors (the `1+ω` noise multiplier, the delay stability
limit, the momentum-versus-`H` curve, the `π/2` median cost) survive on a
trained transformer, or whether they compose: that is, whether one effective-
noise and effective-step description predicts final loss when several axes
change at once. The claim to be checked against the literature and against our
own sweep is narrow: *a composition rule with two or three measured constants
per model size predicts held-out multi-axis configurations at least as well as
a same-size fitted scaling law, and each factor's sign and rough size match
the quadratic derivation.* A negative answer (which factors fail, and by how
much) is also a result.

## Hypotheses

Each states the result that would refute it.

- **H1 (delay limit).** The largest stable outer step on a transformer falls with the outer delay `τ` as `2 sin(π/(4τ+2))` within a factor of 1.5. Refuted if the measured divergence boundary at `τ = 1, 2, 3` departs from the ratios 1 : 0.62 : 0.45 (relative to `τ = 0`) by more than 1.5× at any `τ`.
- **H2 (H-insensitivity).** At fixed total tokens and the outer step scaled to the effective step, the final loss changes by less than the seed-to-seed spread for `H` between 16 and 256, then rises. Refuted if loss at `H = 256` exceeds `H = 16` by more than two seed standard deviations *and* the rise begins below `H = 64`.
- **H3 (compression floor).** The excess loss from an unbiased compressor of relative variance `ω` grows linearly in `1+ω` at small outer step. Refuted if a linear fit of excess loss on `1+ω` over at least four compressors has `R² < 0.5` or a log-log slope outside `[0.6, 1.4]`.
- **H4 (momentum versus H).** The best outer momentum falls as `H` grows. Refuted if the best momentum on a grid at `H = 256` is not below that at `H = 16` at the 95% level over seeds.
- **H5 (robust aggregation).** With no attackers the median costs a variance factor near `π/2` in the noise-dominated regime; under a constant-offset attack it wins past a threshold in honest-noise sigmas. Refuted if the measured cost of the median with no attackers is outside `[1.2, 2.0]` times the mean's, or no crossover appears.
- **H6 (composition, the main claim).** A composition rule with at most three constants per model size, fitted on one third of a factorial grid, predicts held-out configurations with mean absolute percentage error in final loss at most that of a same-size fitted scaling law, with a paired bootstrap interval excluding "worse by more than 10%". Refuted if it is worse by more than 10% on the held-out set.

## Method

Theory. Treat the average inner trajectory as a linear map per curvature mode
(already done for the quadratic in the projects above) and add the part that
matters on a network: a gradient-noise constant `B_noise` measured from the run
(the simple noise scale of McCandlish-style analysis, with the gradient
statistics logged during training) and an effective curvature `s_eff` estimated
from the loss decrease of the first outer steps. The predictor maps
`(H, M, τ, ω, β, aggregator)` to a final-loss excess over the synchronous
baseline using the closed forms already derived. What we try to prove is the
composition: that compression, delay and momentum enter through one
effective-step and one effective-noise factor, and when the cross terms vanish.

Experiments. A GPT-style decoder (nanoGPT architecture) at 0.8M, 3M, 10M and
30M parameters, trained on CPU or one GPU if available, simulating `M` workers
sequentially in one process, with communication modelled, not timed. Data: a
real corpus (Tiny Shakespeare at character level first, which the cloud proxy
serves; a word-level corpus such as WikiText-103 as soon as a host that serves
it is reachable, probed first). Inner optimiser AdamW; outer optimiser SGD with
Nesterov momentum as in DiLoCo. The axes are crossed in a fractional factorial
design. Everything is deterministic given the seed; one command per figure.

## Evaluation

Baselines, run at equal token budgets and with tuned learning rates for each:
(1) synchronous data-parallel AdamW with `M` times the batch, the quality
target; (2) DiLoCo as published (Douillard et al., 2023) with its default
outer settings; (3) the Charles et al. fitted law, refitted on our runs
(same number of parameters as the composition rule); (4) the Hoffmann-form
law with a `H` penalty term. Outer optimisers: Nesterov (DiLoCo), server Adam
(Reddi et al.), and SlowMo-style momentum. Compressors: top-k with error
feedback, rand-k, quantisation, and PowerSGD-style low rank (Vogels et al.).

Metrics: validation loss at a fixed token budget; divergence boundary in outer
step; mean absolute percentage error of predicted against measured final loss
on held-out configurations. Seeds: at least five per cell for the small
sizes, three for the largest; intervals are bootstrap over seeds, with the
paired bootstrap for model comparisons and Holm correction across hypotheses.
Ablations: drop each factor from the composition rule and report the change in
held-out error; check that the constants fitted at one size predict the next
size up.

## Milestones

1. **Harness.** nanoGPT-style trainer with a simulated `M`-worker DiLoCo loop, checked against the synchronous trainer at `M = 1, H = 1` (identical loss curve to numerical tolerance) and against the quadratic projects' closed forms on a quadratic objective inside the same code. Lands with its tests.
2. **Noise and curvature measurement.** Log `B_noise` and `s_eff` for the four sizes; first plot of final loss against `H` (H2).
3. **Delay and momentum axes** (H1, H4), with the divergence-boundary sweep.
4. **Compression and aggregation axes** (H3, H5).
5. **Composition rule and baselines** (H6): fit on a third of the grid, score on the rest, compare with the refitted scaling law.
6. **Scale-up check.** Fit at three sizes, predict the fourth; if a GPU or a word-level corpus is available, repeat one axis there.
7. **Paper draft** in the venue's format, with the reproduction script per figure and a limitations section stating what a CPU-scale study does and does not say about billion-parameter training.

## Target venue

An aim, not a claim of acceptance: a workshop on optimisation for machine
learning or on efficient systems at NeurIPS or ICML (short paper, around 4 to 8
pages plus appendix, artefact welcome) for the first draft, and the ICML or
NeurIPS main track (about 9 pages plus references and appendix, with a
reproducibility checklist) if the composition result holds on a word-level
corpus at more than one size. Submitting publishes under the owner's name and
is an owner step.

## Citation status

Checked 2026-10-29: `python3 research/_shared/cite_check.py research/lowcomm-training/PROPOSAL.md` resolved all 16 arXiv ids. Titles match the lines above, except 1909.04715, whose registry title is the first-version "First Analysis of Local GD on Heterogeneous Data"; the id is the paper cited as "Tighter theory for local SGD on identical and heterogeneous data" (the later title). The earlier note that the host was refused on 2026-10-24 no longer applies. What each paper settles is still stated from the abstract-level reading, not a full re-read.
