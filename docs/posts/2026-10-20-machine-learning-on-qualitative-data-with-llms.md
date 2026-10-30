---
title: "Machine learning on qualitative data: what LLMs make possible, and the correction you can't skip"
seo_title: "Machine learning on qualitative data"
date: 2026-10-20
description: "LLMs let you model interviews and survey answers. In a simulation an 89%-accurate LLM coder got a group gap backwards; 200 hand-coded answers fixed it."
tags: [research, llm, qualitative-research, machine-learning, statistics, survey-analysis]
---

# Machine learning on qualitative data: what LLMs make possible, and the correction you can't skip

Machine learning has always needed numbers. A spreadsheet of prices, clicks or blood
pressures goes straight into a model. An interview transcript, an open-ended survey answer or
a customer review does not. Before LLMs, qualitative data had two ways in. A person could code
it by hand, which is accurate but slow, so studies stayed small. Or software could reduce it to
word counts and topic models, which is fast but loses most of the meaning.

LLMs change that. A model can read an answer the way a trained coder does, apply a codebook
written in plain English ("code 1 if the respondent names cost as a reason they stopped"), and
do it for a fraction of a cent per answer. Gilardi, Alizadeh and Kubli (2023, *PNAS*) found
ChatGPT more accurate than crowd workers on four of five annotation tasks, at about a thirtieth
of the cost. So the answer to "can you do ML on qualitative data now?" is yes. This repository
has opened a research track on it:
[track 19 in `research/PROJECTS.md`](/research/PROJECTS.md), marked as a topic for future
research and applications.

The first project, [`research/qual-correction/`](/research/qual-correction/), asks the question
that has to come first: **when can you trust the numbers?**

## Five things LLMs let you do with qualitative data

1. **Code everything with your codebook.** This is classic content analysis without the
   hand-coding bottleneck: a human writes the codes, the LLM applies them to every answer, and
   each code becomes a column.
2. **Let the model propose the codebook.** TopicGPT (Pham et al., NAACL 2024) returns topics as
   readable labels and descriptions instead of word lists. LLooM (Lam et al., CHI 2024) induces
   concepts with explicit inclusion criteria. This is grounded theory with a fast, fallible
   assistant.
3. **Use text as features next to numbers.** Codes, LLM-scored dimensions ("how urgent is this
   ticket, 1 to 5") or embeddings sit beside numeric columns in an ordinary predictive model.
   TabLLM (Hegselmann et al., AISTATS 2023) goes the other way: it writes table rows out as
   sentences and lets an LLM classify them.
4. **Generate hypotheses.** Ludwig and Mullainathan (*QJE*, 2024) used a model trained on
   unstructured data to find a pattern in judges' decisions that people then put into words and
   tested. An LLM can propose the words itself.
5. **Pilot with simulated respondents.** Argyle et al. (*Political Analysis*, 2023) conditioned
   GPT-3 on real respondents' backstories and reproduced subgroup answer patterns. That is useful
   for testing a questionnaire and dangerous as a replacement for one.

Every one of these feeds the LLM's output into a later statistical step: a count, a comparison,
a regression. So every one inherits the same problem.

## The problem: an LLM's code is a measurement, and measurements have error

When coding was expensive, the main uncertainty was sampling: you coded 300 answers and hoped
they represented 30,000. Cheap coding removes that. You code all 30,000, the confidence interval
shrinks to almost nothing, and it feels like certainty.

But the coder's own error is still there, and a narrow interval hides it. Egami, Hinck, Stewart
and Wei (NeurIPS 2023) showed that LLM labels used directly in a regression can be badly biased,
with invalid intervals, even at 80–90% accuracy. `qual-correction` measures this in the two
settings a qualitative researcher meets most: how common a theme is, and whether it is more
common in one group than another.

## What the simulation found

The project simulates an LLM coder with known error rates, so every estimate can be checked
against the truth. Every number below comes from
[`research/qual-correction/experiments/results.txt`](/research/qual-correction/experiments/results.txt)
(seeded, 1,000 simulated studies per setting). No real model was run. That step is next.

**A good coder is still confidently wrong.** The corpus has 5,000 answers and 30% truly mention
the theme. The coder misses a quarter of real mentions and rarely invents one, so it is 89%
accurate. Its agreement with humans is Cohen's κ = 0.72, which many papers would report as
"substantial". It estimates 26%. Its 95% interval is 2.4 points wide and contains the true 30%
in **0 of 1,000** studies. More data does not help: a bigger corpus only makes the wrong
answer look more certain.

**A group comparison can come out backwards.** Two groups of 2,500 answers each. Group B
mentions the theme more often (34% against 30%). But the LLM is worse at recognising it in group
B's answers, as it might be for dialect, translated or less fluent writing. The naive estimate
of the gap A − B is **+3.6 points; the truth is −4**. It is "statistically significant" in the
wrong direction in **80% of studies**. The error comes from the coder, not from the people, and
nothing in the naive pipeline would flag it.

**200 hand-coded answers fix both.** Prediction-powered inference (Angelopoulos et al., *Science*,
2023) keeps the LLM's codes for the whole corpus and adds a correction: the average gap between
human and LLM codes on a *random* sample of hand-coded answers. With 200 per group:

| | naive LLM codes | 200 hand-coded only | LLM codes + correction |
|---|---:|---:|---:|
| group gap (truth −0.040) | +0.036 | −0.039 | −0.039 |
| interval contains truth | 0% | 96.5% | 97.3% |
| interval width | 0.049 | 0.183 | 0.140 |

For one theme's prevalence, the corrected estimate from 200 hand-coded answers is as precise as
a hand-coded study of 374.

**The correction stops paying below about 80% accuracy.** With a weak coder, the human-minus-LLM
correction is noisier than the human codes themselves. At 70% accuracy the corrected interval is
0.151 wide, against 0.127 from the 200 hand-coded answers alone. It is still valid, just not
worth it. At 95% accuracy it is half as wide (0.067), and at 98% it matches a 1,757-answer
hand-coded study.

## What this means if you analyse qualitative data

- **Use the LLM, and hand-code a random sample anyway.** A couple of hundred is a reasonable
  start. Use one sample per group if you compare groups, and code them blind to the LLM's codes.
- **Agreement scores are not enough.** κ = 0.72 did not reveal that every estimate was 4 points
  low. Agreement tells you how often the coders differ, not which way.
- **Correct before you count.** The project's
  [`qualml.py`](/research/qual-correction/qualml.py) is stdlib Python with κ, Krippendorff's α
  and the prediction-powered estimator. For regressions, use design-based supervised learning
  (Egami et al. 2023).
- **Check that the correction helps.** If its interval is wider than the hand-coded one, the
  coder is too weak: fix the prompt or the codebook first.

## Update (2026-10-21): a codebook induced from the text alone, without a model

Inductive coding means letting the codes come from the data instead of a human codebook. As a
no-model baseline, [`qual-induce`](/research/qual-induce/README.md) fitted NMF topics and k-means
clusters (5 to 60 codes) on half of 5,313 real Reddit comments from GoEmotions and applied them to
the other half. Against the 27-emotion human codebook the agreement was above a size-matched
random assignment but small (normalised mutual information 0.26 for 27 topics against 0.12 at
chance), and the best single induced code per emotion ranked that emotion's comments correctly
about 60% of the time. Chance agreement rises with the number of codes, so a raw agreement score
always favours a bigger codebook; compare against a shuffled baseline. These are topic models,
not an LLM's codebook, so this sets the bar an LLM-proposed codebook has to clear rather than
saying anything about LLMs.

## Update: auditing a group gap

Later projects ran the same idea on 3,188 real GoEmotions comments (still with classical coders, not
LLMs). A hand-coded audit that passes an "overall count is fine" test did not protect a short-versus-long
gap: a coder with zero overall bias still distorted the gap by 0.20
([`qual-gapaudit`](/research/qual-gapaudit/README.md)). And when one group is rare, how the audit is
drawn matters: for the longest 11% of comments, a random audit of 100 items gave intervals 1.7 times as
wide as an audit split evenly between the groups, while for a 36% group the design made no difference
([`qual-stratified`](/research/qual-stratified/README.md)).

## Update (2026-10-23): a table of six groups is not a 95% table

A report rarely shows one group. [`qual-manygroups`](/research/qual-manygroups/README.md) audits
six comment-length groups of 3,188 real GoEmotions comments at once (the smallest is 1.5% of the
corpus). Each row has a 95% prediction-powered interval, but only 71 to 77% of 120 to 240-item
audits with equal numbers per group covered all six true prevalences together (three groups:
85 to 88%). A Bonferroni widening, about a third wider, lifted that to 89 to 94%. A random audit
of 120 items left under five items in the rare group in 291 of 300 draws, so it could not fill
the table at all. The coders are still naive-Bayes models and a word list, not LLMs.

## Update (2026-10-23): a language model as the coder, for the first time

Every coder above was a naive-Bayes model or a word list. [`qual-agent`](/research/qual-agent/README.md)
puts a language model in the seat: the Claude session agent that wrote the project coded 300 real
GoEmotions comments in one pass, never seeing the human labels (not an API-called model, and
labelled that way). It over-coded, flagging 132 comments as negative-emotion where the raters
marked 70, so the naive prevalence was 0.44 against a true 0.23, the opposite error from the
classical coders, which undercounted. Its accuracy (0.71) was no better than naive Bayes
(exact McNemar p = 0.4) and worse than a 38-word list (0.84). Its sensitivity differed by comment
length (0.95 short, 0.76 long), and prediction-powered inference stayed valid but was 29% wider
than hand-coding alone at 60 hand-coded items. A language model is not automatically a better
measuring instrument; it is a different one, and you only find that out against a hand-coded sample.

## What comes next

Track 19 lists the next steps. The first is to run the same pipeline on a public, hand-coded
corpus with a real model. Then: measure whether LLM coding accuracy really differs by dialect or
language, test LLM-proposed codebooks against human ones, use qualitative codes as predictive
features, and extend the correction to regressions. The applications are broad: customer
feedback and support tickets, open-ended survey questions, user research, consultation
responses and qualitative health research. All of them need the same validation step before
the numbers mean anything.

*Produced with AI assistance (Claude). All results come from simulated coders with known error
rates, not from a real LLM or a real dataset. References and limitations are in
[the project README](/research/qual-correction/README.md).*
