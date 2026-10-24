# Research log: llm-coding-inference

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-24 · Milestone 2 (part): estimator library, and a first rare-category result
- Hypothesis (written before running): the normal-approximation interval of the coder-label-stratified estimator undercovers when the target category is rare, because the coder-negative stratum then holds almost no audited errors and its variance estimate is near zero (feeds H2 and H4).
- Built `llmci/estimators.py` (stdlib): naive, human-only, PPI, PPI++ (power-tuned), design-based stratified, group-weighted, confusion-matrix correction, and the closed-form break-even audit size for PPI. 12 tests, including a hand-computed PPI example, the lambda=0/1 endpoints, a Monte Carlo check that the audit-size rule gives equal PPI and human-only standard errors at the break-even n, unbiasedness and coverage of PPI++, and the H1 mechanism (pooled PPI is biased when coder sensitivity differs by group and the audit mix differs from the corpus mix; group-weighted is not). Not yet done from milestone 2: DSL, cross-PPI, a check against a published number, porting the remaining `qual-*` modules.
- Experiment `experiments/rare_coverage.py` (simulated corpora, N=4,000, coder sens 0.6 / spec 0.97, audit 60 coder-positive + 140 coder-negative, 40 corpora x 500 draws per cell). Nominal 95% interval coverage of the stratified estimator: prevalence 1% -> 0.574; 2% -> 0.725; 3% -> 0.832; 5% -> 0.897; 10% -> 0.923; 20% -> 0.942. The hypothesis held, and more strongly than expected: the interval is not close to nominal until about 20% at this audit size. Simulated data with a stand-in coder; whether a real LLM and corpus behave the same is H3's job. Consequence for the programme: H2/H4 comparisons of audit designs must use intervals that stay valid with few events (exact or Wilson-type per-stratum intervals, or a bootstrap), or "narrower" is meaningless. Next: add those intervals to the library and rerun this table.

## 2026-10-24 · Milestone 1a: citations machine-checked
- Ran `cite_check.py` on `PROPOSAL.md` (network worked this time). Two arXiv ids written from memory were wrong: 2309.08574 is an unrelated differential-privacy paper (Cross-prediction-powered inference is 2309.16598) and 2405.20039 is Miao & Lu, *Task-agnostic ML-assisted inference* (Fisch et al., stratified PPI for hybrid LM evaluation, is 2406.04291; its title was also misremembered). Fixed in the proposal. The tool reports `ok` whenever an id resolves, so matching titles had to be read by eye.
- 13 of 14 ids/DOIs now resolve to the intended paper; doi:10.1145/3117807 (González et al.) got HTTP 429 and is unchecked.
- Not done in milestone 1: reading Gligorić et al. and Fisch et al. in full, corpus licences, local-LLM throughput.

## 2026-10-24 · Programme opened: proposal written
- Opened from the table row in `research/PROGRAMMES.md` that had no proposal. Consolidates the `qual-*` directories (22) into one question: valid intervals from LLM-coded text under group shift and rare categories.
- Not machine-checked: arXiv and Crossref returned 403 through the egress proxy this session, so the proposal's ids were written from memory and the proposal says so. Milestone 1 starts by running `research/_shared/cite_check.py` on them and reading the two closest competitors (Gligorić et al. 2024; Fisch et al. 2024) in full. If either already covers the combination in the Gap section, the programme narrows.
- No experiment run. Next: milestone 1.
