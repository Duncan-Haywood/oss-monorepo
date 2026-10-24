# llm-coding-inference: how much hand-coding can an LLM coder replace, with a valid interval?

**Status: open research programme, proposal stage; no result yet.** When an LLM codes qualitative text and you want a valid confidence interval for a prevalence, a group gap or a regression coefficient, how small can the hand-coded audit be, and how should it be sampled, when the model's error differs between groups and the category is rare? See [`PROPOSAL.md`](PROPOSAL.md) for the question, related work, gap, hypotheses H1 to H5, method, evaluation, milestones and target venue, and [`LOG.md`](LOG.md) for the running log.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/llm-coding-inference/

It consolidates the `qual-*` projects (track 19 in [`../PROJECTS.md`](../PROJECTS.md)), which found on GoEmotions with stand-in coders (no LLM) that naive counts are confidently wrong, that prediction-powered inference is valid but no narrower than hand-coding for weak coders, and that a random audit cannot estimate a rare group. Starting points: [`qual-correction`](../qual-correction), [`qual-real`](../qual-real), [`qual-dialect`](../qual-dialect), [`qual-rareerror`](../qual-rareerror).

Related labs: none claimed; this is methods work for computational social science. Written with AI assistance (Claude Code); no affiliation is implied with any author cited.

**Limitations.** The references in the proposal were not machine-checked (arXiv and Crossref returned 403 in the writing session); milestone 1 does that first.

## Code

`llmci/estimators.py` (stdlib only) holds the estimators the programme compares: human-only, naive,
PPI, PPI++, design-based IPW audit, stratified PPI and binary label-shift correction.
Tests: `python3 -m pytest research/llm-coding-inference/test_llmci.py`. Checked against closed
forms and a 600-study simulation; not yet against a published dataset.
