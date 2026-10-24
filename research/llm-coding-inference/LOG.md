# Research log: llm-coding-inference

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-24 · Milestone 2: estimator library `llmci/`
- Hypothesis (planned before running): the library's PPI++ and stratified-PPI intervals cover 95% (within 3 binomial sd over 600 simulated studies, n=2000, audit 150, prevalence 25%, coder sens 0.75 / spec 0.90), and are narrower than human-only.
- Built `llmci/estimators.py` (stdlib only): `human_only`, `naive`, `ppi` (fixed lambda), `ppi_pp` (clipped optimal lambda), `ipw_audit` (known inclusion probabilities, Poisson variance), `stratified_ppi` (finite-population correction), `label_shift` (binary BBSE, delta-method se). 7 tests in `test_llmci.py`: lambda endpoints, a perfect coder, closed forms for IPW and stratified variance, exact label-shift recovery, and the Monte Carlo coverage check above.
- Outcome: all 7 pass. The coverage check held. Checked against closed forms and simulation only; no published numerical example is reproduced yet (the PPI papers' datasets are not fetched). Not yet covered: DSL with a fitted nuisance model, cross-PPI, active sampling, regression coefficients.
- Consolidation is partial: the `qual-*` modules are untouched and still carry their own copies.
- Next: milestone 3 (H1, group-shift benchmark on a real multi-group corpus), which needs a group-aware estimator on top of `stratified_ppi`.

## 2026-10-24 · Milestone 1a: citations machine-checked
- Ran `cite_check.py` on `PROPOSAL.md` (network worked this time). Two arXiv ids written from memory were wrong: 2309.08574 is an unrelated differential-privacy paper (Cross-prediction-powered inference is 2309.16598) and 2405.20039 is Miao & Lu, *Task-agnostic ML-assisted inference* (Fisch et al., stratified PPI for hybrid LM evaluation, is 2406.04291; its title was also misremembered). Fixed in the proposal. The tool reports `ok` whenever an id resolves, so matching titles had to be read by eye.
- 13 of 14 ids/DOIs now resolve to the intended paper; doi:10.1145/3117807 (González et al.) got HTTP 429 and is unchecked.
- Not done in milestone 1: reading Gligorić et al. and Fisch et al. in full, corpus licences, local-LLM throughput.

## 2026-10-24 · Programme opened: proposal written
- Opened from the table row in `research/PROGRAMMES.md` that had no proposal. Consolidates the `qual-*` directories (22) into one question: valid intervals from LLM-coded text under group shift and rare categories.
- Not machine-checked: arXiv and Crossref returned 403 through the egress proxy this session, so the proposal's ids were written from memory and the proposal says so. Milestone 1 starts by running `research/_shared/cite_check.py` on them and reading the two closest competitors (Gligorić et al. 2024; Fisch et al. 2024) in full. If either already covers the combination in the Gap section, the programme narrows.
- No experiment run. Next: milestone 1.
