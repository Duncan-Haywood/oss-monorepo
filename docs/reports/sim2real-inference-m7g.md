# sim2real-inference m7g: larger-n certificate check (agent doc)

- Added `experiments/m7g_large_n/largen.py` (seconds). Result: fixed-weight PPI-EB narrower than real-only on 0/42 pairs up to n = 1,920; analytic crossover n* 2,567 to 276,681 (twin mean exact).
- New related work: SureSim, arXiv:2510.04354 (ICRA 2026), now in `paper/refs.bib` and the paper's related work. Only its abstract and search snippets were read: arxiv.org is 403 through the proxy, so `cite_check.py` could not verify the id here (it was confirmed by search results). **Next run: get the full text (try the project page suresim-robot-eval.github.io or add a mirrored copy) and implement its estimator and interval to find why it gains at N = 700; then add to the PROPOSAL's related work and Gap.**
- Also seen in search, not read: arXiv:2607.14439 (active real-world factor-based evaluation), arXiv:2606.05159 (X4Val, neural surrogates for variance-reduced policy evaluation). Both may overlap the active-selection and variance-reduction claims; read before the Gap is finalised.
- Still the main gap: per-episode real pairs.
