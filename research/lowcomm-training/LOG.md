# Research log: lowcomm-training

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-24 · Milestone 1: harness (planned before running)
- Built `src/lowcomm/` (nanoGPT-layout model, char data, simulated `M`-worker DiLoCo engine with per-worker AdamW state, Nesterov outer SGD) and `tests/`.
- Pre-registered checks, run by `experiments/m1_check.py`: (a) at `M = 1, H = 1`, outer SGD lr 1, DiLoCo and the synchronous AdamW loop give the same loss curve and parameters to 1e-5; (b) on a 3-mode quadratic with gradient noise, run through the same engine with SGD inner and heavy-ball outer, the time-averaged stationary loss over 8 seeds agrees with the closed form of `noisy-local-sgd` within 5% (the 95% interval over seeds contains the closed form); (c) a first transformer run (single seed, preliminary) that DiLoCo at `M = 4, H = 16` trains at all: validation loss falls well below the unigram entropy of the corpus. Refutation of (a) or (b) means the engine is wrong and nothing downstream is trusted.

### Outcome (all three pre-registered checks passed)
- (a) `M = 1, H = 1`, outer SGD lr 1: max loss difference 0 and max parameter difference 0 over 100 steps (0.41M-parameter model; bit-identical, because the pseudo-gradient step reproduces the inner step exactly).
- (b) Quadratic through the same engine: closed form 0.02842, simulated 0.02794 +/- 0.00079 (95% CI, 8 seeds), ratio 0.983. The interval contains the closed form, so the engine reproduces the `noisy-local-sgd` stationary loss.
- (c) Preliminary, one seed: DiLoCo `M = 4, H = 16` on Tiny Shakespeare, validation loss 2.202, 1.973, 1.853 after 20, 40, 60 rounds, against a unigram entropy of 3.313 nats, so it trains. This is not a result about `H`.
- Caveats: the smallest model is 0.41M parameters, not the 0.8M planned; no learning-rate tuning yet; citations still unchecked (registries unprobed this session).
- Next: milestone 2, `B_noise` and `s_eff` measurement and the first loss-versus-`H` plot at equal tokens, with at least five seeds.

## 2026-10-24 · Programme opened
- Wrote `PROPOSAL.md`: 16 outside references, our own ~12 quadratic-model projects as prior work, six falsifiable hypotheses (H1 to H6), seven milestones, target an optimisation/efficiency workshop then ICML or NeurIPS.
- Citations are not machine-checked: arXiv and Crossref returned 403 through the proxy this session. Re-run `cite_check.py` first thing in a session with access.
- Data reachable from this session: Tiny Shakespeare via raw.githubusercontent.com and pip via pypi.org; huggingface.co was not reachable (probe again).
- Next: milestone 1. Build the simulated `M`-worker DiLoCo trainer, and test it against the synchronous trainer and a quadratic closed form from `noisy-local-sgd`.
