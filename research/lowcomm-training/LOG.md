# Research log: lowcomm-training

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-24 · Programme opened
- Wrote `PROPOSAL.md`: 16 outside references, our own ~12 quadratic-model projects as prior work, six falsifiable hypotheses (H1 to H6), seven milestones, target an optimisation/efficiency workshop then ICML or NeurIPS.
- Citations are not machine-checked: arXiv and Crossref returned 403 through the proxy this session. Re-run `cite_check.py` first thing in a session with access.
- Data reachable from this session: Tiny Shakespeare via raw.githubusercontent.com and pip via pypi.org; huggingface.co was not reachable (probe again).
- Next: milestone 1. Build the simulated `M`-worker DiLoCo trainer, and test it against the synchronous trainer and a quadratic closed form from `noisy-local-sgd`.
