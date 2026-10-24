# Proposal: valid downstream inference from LLM-coded qualitative data under group shift and rare categories

Programme `llm-coding-inference`, opened 2026-10-24. Written with AI assistance
(Claude Code). This is a plan, not a result: nothing below has been measured
unless it cites an existing `qual-*` project in this repository. **Citation
status:** the egress proxy returned 403 for arXiv and Crossref in the session
that wrote this, so `research/_shared/cite_check.py` could not look the ids up.
Every id below was written from memory of the paper and is **not
machine-checked**; each is to be run through `cite_check.py` and opened by hand
in milestone 1 before any README or paper relies on it. Claims about what a
paper settles rest on its title and abstract as remembered, not on a full read.

## Question

When a language model codes qualitative text (interviews, open survey answers,
posts) and a researcher wants a valid confidence interval for a prevalence, a
group gap or a regression coefficient, how much of the hand-coding can the
model replace, and does the interval stay valid when (a) the model's error
differs between groups whose mix differs between the hand-coded audit and the
corpus, and (b) the category of interest is rare?

It is open because the main correction methods (prediction-powered inference,
design-based supervised learning) prove validity for a random audit and report
gains on common categories, while applied papers use LLM codes on rare
categories and unequal groups, where the interval's width, not only its
coverage, decides whether the audit is worth it.

## Why it matters

Social scientists, user researchers and health researchers now code thousands of
documents with an LLM. Our own `qual-*` projects (22 directories) show on
GoEmotions that naive counts are confidently wrong and that corrections are
valid but, for weak coders, wider than hand-coding alone. A practitioner needs
a rule: for this coder, this category rate and this group structure, how many
items to hand-code, how to sample them, and when to skip the model. A
defensible answer changes how qualitative LLM studies budget their audits.

## Related work

**Prediction-powered and design-based correction.**
- Angelopoulos, Bates, Fannjiang, Jordan & Zrnic (2023), *Prediction-powered
  inference*, *Science*; [arXiv:2301.09633](https://arxiv.org/abs/2301.09633),
  doi:10.1126/science.adi6000. Valid intervals from a small labelled set plus
  many model predictions. Random labelled sample, one population.
- Angelopoulos, Duchi & Zrnic (2023), *PPI++: efficient prediction-powered
  inference*; [arXiv:2311.01453](https://arxiv.org/abs/2311.01453). Tuned
  weight so the interval is never worse than labelled-only, asymptotically.
  Settles weak coders for means; says little about rare categories at finite n.
- Zrnic & Candès (2024), *Cross-prediction-powered inference*, *PNAS*;
  [arXiv:2309.08574](https://arxiv.org/abs/2309.08574). Drops the need for a
  held-out predictor by cross-fitting; relevant when the coder is trained on
  the audit.
- Egami, Hinck, Stewart & Wei (2023), *Using imperfect surrogates for
  downstream inference: design-based supervised learning for social science
  applications of large language models*, NeurIPS;
  [arXiv:2306.04746](https://arxiv.org/abs/2306.04746). Design-based
  estimators allowing non-uniform audit sampling probabilities.
- Fisch, Maynez, Hofer, Dhingra, Globerson & Cohen (2024), *Stratified
  prediction-powered inference for effective performance evaluation with
  semi-supervised learning*; [arXiv:2405.20039](https://arxiv.org/abs/2405.20039).
  Stratification of the audit; the closest method to our stratified audits.
- Zrnic & Candès (2024), *Active statistical inference*;
  [arXiv:2403.03208](https://arxiv.org/abs/2403.03208). Choose which items to
  label by model uncertainty; the baseline for our audit-design hypothesis.

**LLMs as annotators.**
- Gilardi, Alizadeh & Kubli (2023), *ChatGPT outperforms crowd workers for
  text-annotation tasks*, *PNAS*; [arXiv:2303.15056](https://arxiv.org/abs/2303.15056).
  Accuracy and cost of LLM coding on several tasks; reports agreement, not
  inference validity.
- Ziems et al. (2024), *Can large language models transform computational
  social science?*, *Computational Linguistics*;
  [arXiv:2305.03514](https://arxiv.org/abs/2305.03514). 24 benchmarks; good
  accuracy on some, weak on others; no downstream interval.
- Gligorić, Zrnic, Lee, Candès & Jurafsky (2024), *Can unconfident LLM
  annotations be used for confident conclusions?*;
  [arXiv:2408.15204](https://arxiv.org/abs/2408.15204). Confidence-driven
  inference using the model's stated confidence; the closest direct competitor
  to our programme, so the narrowest novelty claim below is drawn against it.

**Shift and quantification.**
- Lipton, Wang & Smola (2018), *Detecting and correcting for label shift with
  black box predictors*; [arXiv:1802.03916](https://arxiv.org/abs/1802.03916).
  Confusion-matrix correction under label shift; assumes the error rates are
  the same in both populations, the assumption group shift breaks.
- Hopkins & King (2010), *A method of automated nonparametric content
  analysis for social science*, *Am. J. Political Science*;
  doi:10.1111/j.1540-5907.2009.00428.x. The classic case for estimating
  category proportions rather than classifying single documents.
- González, Castaño, Chawla & del Coz (2017), *A review on quantification
  learning*, *ACM Computing Surveys*; doi:10.1145/3117807. Quantification
  methods and their behaviour under prior shift.

**Data and our own earlier work.**
- Demszky et al. (2020), *GoEmotions*, ACL; [arXiv:2005.00547](https://arxiv.org/abs/2005.00547).
  The hand-coded corpus the `qual-*` projects use.
- `qual-correction`, `qual-real`, `qual-dialect`, `qual-stratified`,
  `qual-manygroups`, `qual-rareerror`, `qual-lowrate`, `qual-labelaudit`,
  `qual-gapaudit`, `qual-equivalence`, `qual-regression` (this repository).
  Each probed one corner on one corpus with stand-in coders (naive Bayes, a
  word list), no LLM: PPI is valid but wider than hand-coding for weak coders;
  an audit of only the coder's positives never covers; equal-numbers
  stratification matches the optimal split; a six-group audit needs
  Bonferroni; a rare group cannot be estimated from a random audit.

## Gap

Stated narrowly, so it can be checked against the above: no cited work gives a
finite-sample, audit-size rule for **LLM-coded** prevalences and gaps when the
coder's error rate differs across groups **and** the target category has
prevalence below about 5%, validated on a real hand-coded corpus with a real
LLM, together with the coverage and width of a coder-label-stratified audit
against uniform, Fisch-style stratified and uncertainty-based (Zrnic & Candès,
Gligorić et al.) audits at equal hand-coding budgets. Our `qual-*` projects
supply each ingredient separately on one corpus with weak stand-in coders; the
programme combines them, replaces the stand-ins with real LLMs, and adds a
second and third corpus. If Gligorić et al. or a later paper already covers the
combination, milestone 1 finds out and the programme narrows to the part that
is not covered.

## Hypotheses

- **H1 (pooled correction fails under group shift).** When coder sensitivity
  differs by group (as measured by `qual-dialect`, 0.4 to 11% in some
  languages) and the audit's group mix differs from the corpus's, a pooled PPI
  interval for the corpus prevalence undercovers (95% interval covers below
  90%), and a group-stratified estimator with corpus-known group weights
  restores at least 94%. Refuted if the pooled interval covers 93% or more in
  every shifted design.
- **H2 (rare categories end the gain).** For a category with corpus prevalence
  at or below 2%, PPI++ with a uniformly sampled audit of 200 items has
  interval width within 10% of human-only (no gain), while an audit stratified
  by the coder's label with inverse-probability weights cuts width by at least
  25% at equal n. Refuted if uniform PPI++ is 25% or more narrower than
  human-only at 2%, or the stratified audit gains under 10%.
- **H3 (a real LLM changes the break-even).** With a real instruction-following
  LLM as coder, the audit size at which PPI++ beats human-only by 20% in width
  is at least 3 times smaller than for the best stand-in coder on the same
  corpus and category. Refuted if the ratio is under 2.
- **H4 (audit design).** At equal budget, coder-label stratification and
  uncertainty-based sampling give narrower valid intervals than uniform
  sampling for prevalences under 5%, and the two are within 10% of each other.
  Refuted if either loses to uniform, or the gap between them exceeds 10%.
- **H5 (a closed form).** Interval width under stratified PPI follows the
  plug-in variance formula using the coder's per-stratum sensitivity,
  specificity and the audit allocation, within 10% of simulated width across
  designs, so the audit size can be planned before coding.

## Method

*Theory.* Write the estimator for a prevalence and a group gap under
stratified audits with known sampling probabilities (design-based, following
Egami et al.), derive the variance as a function of coder error rates per
group, stratum and allocation, and give the audit-size rule that H5 tests. Check
the validity proof in the stratified, finite-population-correction case.

*Experiments.* Real corpora with human codes and group labels, each with a
permissive licence and no personal data committed: GoEmotions (done in
`qual-real`), at least two more chosen in milestone 1 (candidates to check:
public tweets with human labels in several languages as in `qual-dialect`'s
source, and an open survey-response corpus). Coders: the two stand-ins from
`qual-real`; a local open-weights instruction model run on CPU with a cached,
deterministic prompt (feasibility measured in milestone 1); and an API model
only if `ANTHROPIC_API_KEY` is set in the session, with outputs cached and
labelled as session-agent or API codings. Every LLM result is labelled with
the exact model.

## Evaluation

Baselines: human-only; naive; PPI and PPI++; cross-PPI; DSL with uniform
probabilities; stratified PPI (Fisch et al.); active/uncertainty sampling
(Zrnic & Candès, Gligorić et al.); label-shift correction (Lipton et al.) as a
count-correction baseline. Same corpus, same hand-coded budget, nested audits
so budgets are comparable. Metrics: 95% interval coverage (with a binomial
interval on the coverage), mean width, bias, RMSE, and the audit size to reach
a target width. At least 1,000 audit draws per cell, seeds stated; paired
differences in width with bootstrap intervals; Holm correction over the
hypotheses. Ablations: coder quality (stand-ins vs LLM vs a degraded LLM),
prevalence (0.5% to 30% by subsampling), group-mix shift size, audit size.

## Milestones

1. Check every citation (`cite_check.py`, by hand where the host is blocked),
   read Gligorić et al. and Fisch et al. in full, and narrow the gap if they
   cover it; pick and licence-check two more corpora; measure whether a local
   LLM codes 5,000 items in the time a session allows. `LOG.md`.
2. Library: one estimator module (human-only, naive, PPI, PPI++, DSL,
   stratified, label-shift) with tests against a published number and a closed
   form, consolidating the `qual-*` modules.
3. H1: group-shift benchmark on a real multi-group corpus.
4. H2 and H4: rare-category and audit-design benchmark.
5. H3: real-LLM coder on all corpora, cached codes.
6. H5: closed-form audit-size rule and its check; regression-coefficient
   extension.
7. `paper/` in the venue's format; owner step: submission.

## Target venue

*Sociological Methods & Research* or *Political Analysis* (methods papers on
measurement with text), with an NLP + computational social science workshop
(for example the NLP+CSS workshop at ACL/EMNLP) as the fast first target.
Journal length is open; the workshop shape is 8 pages plus references and an
artefact link. This is an aim, not a claim of acceptance.
