# llm-coding-inference: how much hand-coding can an LLM coder replace, with a valid interval?

**Status: open research programme; estimator library built (`llmci/`); H1 supported on real data (milestone 3); one preliminary simulated result below.** When an LLM codes qualitative text and you want a valid confidence interval for a prevalence, a group gap or a regression coefficient, how small can the hand-coded audit be, and how should it be sampled, when the model's error differs between groups and the category is rare? See [`PROPOSAL.md`](PROPOSAL.md) for the question, related work, gap, hypotheses H1 to H5, method, evaluation, milestones and target venue, and [`LOG.md`](LOG.md) for the running log.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/llm-coding-inference/

It consolidates the `qual-*` projects (track 19 in [`../PROJECTS.md`](../PROJECTS.md)), which found on GoEmotions with stand-in coders (no LLM) that naive counts are confidently wrong, that prediction-powered inference is valid but no narrower than hand-coding for weak coders, and that a random audit cannot estimate a rare group. Starting points: [`qual-correction`](../qual-correction), [`qual-real`](../qual-real), [`qual-dialect`](../qual-dialect), [`qual-rareerror`](../qual-rareerror).

Related labs: none claimed; this is methods work for computational social science. Written with AI assistance (Claude Code); no affiliation is implied with any author cited.

**Preliminary result (simulated, stand-in coder).** The normal-approximation interval of a coder-label-stratified audit covers 57% at 1% prevalence, 83% at 3%, 92% at 10% and 94% at 20% (nominal 95%; 200 audited items of 4,000; [`experiments/rare_coverage.txt`](experiments/rare_coverage.txt)). Audit-design comparisons for rare categories therefore need small-count-safe intervals first. Reproduce: `python3 experiments/rare_coverage.py`.

**Real-data result (H1, milestone 3).** On 44,485 NaijaSenti tweets in four languages with native-speaker labels, with the audit's language mix different from the corpus's, the pooled prediction-powered 95% interval covers as little as 67% (a 70%-Hausa audit of 400 tweets, English-trained coder) and 69% (in-language coder); PPI++ is 89%; even pooled hand-coding covers only 87% under an equal-quota audit. A language-stratified estimator with corpus-known language sizes covers 93.8 to 95.9% in every design (the planned bar was 94%; one cell is 0.2 points under). It is not narrower than stratified hand-coding, because these stand-in coders are weak. No LLM yet; one corpus; three audit mixes. Reproduce: `python3 experiments/group_shift.py` (needs the `qual-dialect` tweet cache); table in [`experiments/group_shift.txt`](experiments/group_shift.txt).

**Rare-category result (H2 and H4, milestone 4; both refuted as stated).** On GoEmotions (38,234 comments, nine emotions from 0.10% to 1.96% prevalence, audit of 200, 1,000 draws, a weak stand-in coder) the normal-approximation intervals of uniform human-only, PPI++ and coder-label-stratified audits cover as little as 10 to 61% below 0.5% prevalence, so a "narrower" interval there is not a valid one. Wilson intervals on a uniform audit cover 91 to 99%. An audit that samples by coder uncertainty with inverse-probability weights covers 93 to 96% for seven of the nine categories (those at or under 1.05%) and is 22 to 52% narrower than Wilson for six of them, but covers only 86% (disgust) and 89% (sadness) for the two most common ([`experiments/rare_audit.txt`](experiments/rare_audit.txt), [`LOG.md`](LOG.md)). Two small-count-safe intervals for that weighted audit (Wilson at a Kish-type effective size; a bootstrap) do not fix it: Wilson covers 82 to 84% for grief and pride, the bootstrap 78 to 90% for the three commonest, so no interval tried is valid over the whole 0.1 to 2% range (milestone 4b).

**Limitations.** The references in the proposal were not machine-checked (arXiv and Crossref returned 403 in the writing session); milestone 1 does that first.

## Code

`llmci/estimators.py` (stdlib only) holds the estimators the programme compares: human-only, naive,
PPI, PPI++, design-based IPW audit, stratified PPI, stratified human-only and binary label-shift correction.
Tests: `python3 -m pytest research/llm-coding-inference/test_llmci.py`. Checked against closed
forms and a 600-study simulation; not yet against a published dataset.
