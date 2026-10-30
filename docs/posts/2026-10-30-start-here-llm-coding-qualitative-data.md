---
title: "Start here: you coded open-ended text with an LLM. Can you trust the statistics?"
seo_title: "LLM-coded qualitative data: getting valid statistics afterwards"
date: 2026-10-30
tags: [start-here, qualitative-coding, llm-coding-inference, prediction-powered-inference, statistics]
description: "For social scientists, survey and UX researchers: how big a hand-coded audit must be for a valid interval on LLM-coded text, with free code."
---

# Start here: you coded open-ended text with an LLM. Can you trust the statistics?

This guide is for people who turn words into numbers. You might be a sociologist or political scientist with thousands of interview excerpts or tweets. You might run surveys and face a column of open-ended answers. You might be a UX researcher sorting support tickets or app reviews into themes. You asked a language model to apply your codebook, and now you want to report a share, a difference between groups or a regression coefficient, with an interval a reviewer will accept.

The repository's research programme `research/llm-coding-inference` works on that step, and about twenty earlier `qual-*` projects feed it. Its page is [on the live site](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/llm-coding-inference/).

## The problem, in your words

"The model agrees with my coders 85% of the time. Isn't that good enough to count its labels?" "How many answers do I have to hand-code to check it?" "The theme I care about turns up in 1% of responses. Does any of this still work?" "My respondents write in more than one language."

The short version of what the projects found: counting a model's codes and putting a textbook interval around the count can be confidently wrong. The fix is to hand-code a random audit and use it to correct the count. The open questions are how small that audit can be and how to draw it.

## What you get

- **Evidence that naive counts fail, on real labelled text.** In `qual-real`, on 3,188 Reddit comments with human emotion labels, a stand-in coder reported 13.3% negative emotion against a human 25.3%, and its naive interval covered the truth in 0 of 500 draws. Prediction-powered inference (PPI) with 200 hand-coded items brought coverage back to 0.94 to 0.97.
- **What happens when coder error differs by group.** On 44,485 NaijaSenti tweets in four languages with native-speaker labels, a pooled PPI interval covered as little as 67% when the audit's language mix differed from the corpus. An estimator stratified by language, with the language sizes known from the corpus, covered 93.8 to 95.9% in every design.
- **What happens with rare themes.** On GoEmotions categories below 0.5% prevalence, normal-approximation intervals covered as little as 10 to 61%. Wilson intervals on a plain random audit covered 91 to 99%.
- **A finding about which number to look at.** Agreement is the wrong yardstick. On one corpus, where 32.7% of tweets are negative, a coder that labels everything "not negative" already agrees 67.3% of the time. Informedness (sensitivity plus specificity minus 1) is what predicts how much a coder saves you. The README's milestone 5h estimates that a 20% narrower interval needs informedness of about 0.5.
- **Results with a real model, reported plainly.** A zero-shot Qwen2.5-1.5B-Instruct coder agreed with the human labels on 6,000 tweets 66.1% of the time, worse than a naive Bayes classifier (73.5%). With valid intervals, it made the interval only 2.2% narrower than hand-coding alone at an audit of 400. Larger, stronger models are not yet tested.
- **Code you can use.** `llmci/` is a small Python library. `estimators.py` (standard library only) has human-only, naive, PPI, PPI++, stratified PPI, a design-weighted audit and audit sizing. `audit_design.py` turns a pilot into an audit plan (`plan_audit`) and closes it with an interval (`audit_interval`). `regression.py` (needs `numpy`) has prediction-powered regression.
- **A paper draft**, `paper/paper.md`, marked "Draft 1, not ready to submit".

## Your first ten minutes

1. **Read the status line and limitations** at the top of `research/llm-coding-inference/README.md`. It says which results use a real LLM and which use stand-in coders.
2. **Fetch just this project** with a sparse clone (the full repository is several gigabytes):

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/llm-coding-inference
   cd research/llm-coding-inference
   ```

3. **See the rare-category problem for yourself.** `python3 experiments/rare_coverage.py` needs only the standard library and took about 28 seconds here. It simulates audits of 200 items from 4,000 and prints how often a nominal 95% interval covers the truth. In this guide's run it printed 0.574 at 1% prevalence, 0.832 at 3% and 0.942 at 20%, matching the README.
4. **Plan and close an audit on toy data.** Save this as `toy.py` in the project folder and run `PYTHONPATH=. python3 toy.py`. The data are made up: a 20% theme and a coder that is right 85% of the time.

   ```python
   import random
   from llmci.audit_design import plan_audit, audit_interval

   rng = random.Random(1)
   truth = [1 if rng.random() < 0.2 else 0 for _ in range(5000)]   # made-up human codes
   codes = [t if rng.random() < 0.85 else 1 - t for t in truth]   # made-up model codes
   pilot = {i: truth[i] for i in rng.sample(range(5000), 120)}    # hand-code a random pilot
   plan = plan_audit(codes, pilot, n=400)
   print(plan["design"], plan["to_label"])
   labels = dict(pilot)
   for cell, k in zip(plan["cells"], plan["to_label"]):
       for i in rng.sample([i for i in cell if i not in labels], k):
           labels[i] = truth[i]                                       # hand-code the rest
   print(audit_interval(plan, codes, labels), sum(truth) / len(truth))
   ```

   When this guide was written it chose the "cells" design (separate strata for items the coder marked yes and no), asked for 118 and 162 more items, and gave an estimate of 0.193 with an interval from 0.168 to 0.220. The true share was 0.199. With your own data, `codes` is the model's 0/1 label for every item and the pilot is a random sample you coded by hand.
5. **Read the docstrings.** `plan_audit` explains why the pilot must be a random draw. The module header says the screening rule is a heuristic with no coverage theorem, checked on two corpora.

The tests are `python3 -m pytest test_llmci.py` and need `pytest`. Most experiment scripts need corpus caches from sibling projects, such as the `qual-dialect` tweet cache, and the README says which.

## How to get involved

The programme's own log names its main gap: an informative coder on a second corpus. Recent sessions could not download model weights (Hugging Face returned 403), so the strongest evidence uses one small model on one corpus. Useful contributions from this audience:

- **A labelled corpus with groups.** Open text with human codes and a group variable (language, region, demographic, product line), under a licence that allows research use.
- **A field report.** If you ran an LLM coder and hand-coded a random audit, the coder's sensitivity and specificity per group are the numbers the planning rules need. Aggregates are enough. Do not send respondents' text or anything identifying.
- **A methods correction.** If an estimator, a variance or a citation looks wrong to you, point at the file and line.

Use [the feature form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml) for data and ideas, and [the bug form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml) for a wrong number. The maintainer reviews fork pull requests by hand; the AI agents never act on them. An idea is weighed, not promised.

## Cost and data

Free and MIT licensed. The library runs on your machine and does not call any model or service; you bring the codes. Your text never needs to go near it, only 0/1 labels. The corpora behind the experiments are public research datasets. `qual-dialect`, for example, downloads NaijaSenti from the authors' repository into a cache outside the repository and commits no tweet text.

## What it does not do

- **It does not code your text.** It handles what comes after: the audit and the interval.
- **Most results use stand-in coders.** Word lists, naive Bayes and logistic regression stand in for an LLM in most experiments. One small model family (Qwen2.5 at 0.5B, 1.5B and 3B) has been run, zero-shot.
- **Two main corpora.** NaijaSenti and GoEmotions, both short social-media text with binary targets. Interviews, long answers and multi-label codebooks are untested.
- **No guarantee for the screening rule.** Its coverage was 92.0 to 96.6% across the library check's cells, which is evidence, not a theorem.
- **Not peer reviewed, and not statistical advice for your study.** It was produced by AI coding agents with the owner steering. It claims no affiliation with any author it cites. Check the method against your own design, and ask a statistician where the stakes are high.

## Where to go next

- The programme: `research/llm-coding-inference/README.md`, `PROPOSAL.md` and `LOG.md`
- The paper draft: `research/llm-coding-inference/paper/paper.md`
- Starting points: `research/qual-correction` (when to trust LLM codes at all), `research/qual-real`, `research/qual-dialect` (coder error across four languages) and `research/qual-rareerror`
- All open programmes: `research/PROGRAMMES.md`
- How to rerun, reuse and cite any project: [Start here: the open research](2026-10-29-start-here-research.md)
- A self-hosted prototype for ranking a list by paired choices: [Start here: Quick Pick](2026-10-29-start-here-quick-pick-survey.md)
- How outside contributions land: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
