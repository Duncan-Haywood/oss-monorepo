---
title: "A wrong answer key, found by who chose the wrong answer: item response theory in the browser"
seo_title: "Free item response theory tool: Rasch, 2PL, item fit, distractors"
date: 2026-11-17
tags: [item-response-theory, psychometrics, rasch-model, test-design, research-algorithms]
description: "A free browser IRT tool fits Rasch and 2PL models, matches ltm's published LSAT output, and flags SAT12 question 32's suspect key from its answers alone."
---

A teacher who has marked a test has a table: one row per student, one
column per question, right or wrong. The usual summary is the percentage
who got each question right. That number mixes two things: how hard the
question is and how able this particular class happened to be. It also says
nothing about whether a question separates the students who know the
material from those who do not.

Item response theory (IRT) separates those things. It models the chance of
a right answer as a logistic curve in the student's ability, with two
properties per question: a **difficulty** (the ability at which half get it
right) and a **discrimination** (how steeply the curve rises there). The
new [item response theory tool](https://marisstella.app/item-response-theory/)
fits the one-parameter model (every question shares a slope; the Rasch
model) and the two-parameter model (each question gets its own) by
marginal maximum likelihood, the EM algorithm of Bock & Aitkin (1981). It
runs in the browser; nothing is uploaded.

## Checked against a published table

The standard first example in IRT is Section 6 of the Law School Admission
Test: 1,000 examinees, 5 questions, published by Bock & Lieberman (1970)
and shipped with the R package ltm. Rizopoulos (2006) prints ltm's output
for it in the *Journal of Statistical Software*. The tool's 1PL matches
every printed digit:

| | Printed by ltm | This tool |
| --- | --- | --- |
| Question 1 difficulty (SE) | -3.6153 (0.3266) | -3.6153 (0.3266) |
| Question 3 difficulty (SE) | -0.3176 (0.0977) | -0.3176 (0.0977) |
| Shared slope (SE) | 0.7551 (0.0694) | 0.7551 (0.0694) |
| Log-likelihood | -2466.938 | -2466.938 |
| 2PL vs 1PL likelihood ratio | 0.57 on 4 df, p = 0.967 | 0.57 on 4 df, p = 0.967 |

The other three difficulties and standard errors match too, and so do the
AIC and BIC of both models. The Python package girth, a separate
implementation, agrees within 0.0002 on the same data. The 2PL's four
extra slopes buy almost nothing here, so the tool keeps the 1PL.

Two other things fall out of the fit. All five questions are easy for this
group, so the test measures most precisely at an ability of -1.90, almost
two standard deviations below the average examinee, and its marginal
reliability is only 0.29. A percent-correct table would not say either.

## The wrong key

The more useful check for a teacher is older than IRT: for each question,
who chose each answer? If a wrong answer is chosen by students who do
better on the rest of the test than the students who chose the key, either
the key is wrong or the question is ambiguous.

The tool runs that check whenever it is given raw answers and a key. On
SAT12, 600 grade-12 science students answering 32 multiple-choice questions
(from the TESTFACT manual, distributed with the R package mirt), it flags
question 32:

| Answer to question 32 | Chose it | Mean right on the other 31 |
| --- | --- | --- |
| 1 | 12.5% | 17.6 |
| 2 | 18.3% | 16.2 |
| **3** | **44.3%** | **19.2** |
| 4 | 7.5% | 17.0 |
| 5 (the documented key) | 16.2% | 18.5 |

Under the documented key the question has a discrimination of 0.12 and an
item-rest correlation of 0.02: it tells strong and weak students apart
barely at all, and its fitted difficulty runs off to 14 standard
deviations. Rescored with answer 3 as the key, its discrimination rises to
0.47 and its item-rest correlation to 0.18. mirt's documentation reaches
the same suspicion by a heavier route, the nominal response model: the key
for question 32 "may be incorrect, and should be changed from 5 to 3".

The table also flags question 12, but by a margin too small to mean much
(mean rest 18.5 for answer 3 against 18.3 for the key), and nothing outside
the data says whether that key is wrong. A flag is a reason to reread the
question, not a verdict.

## What the simulation says the fit test can and cannot see

Each question also gets an S-X2 fit test (Orlando & Thissen 2000), which
compares the share who got it right at each total score with the share the
model predicts. On 60 simulated tests of 20 questions and 1,000 people, it
flagged 5.1% of questions that fit at the 5% level, which is what a fit
test should do, and the 95% intervals covered 95.1% of the true slopes and
95.5% of the true difficulties.

The less flattering number: one question in each simulated test had a 25%
guessing floor, which a 2PL cannot represent. S-X2 caught it in only 7 of
60 tests. With 1,000 people and a fairly easy guessed question the misfit
is too small to see. A clean fit table is weak evidence that nobody is
guessing.

## Next

The tool fits right/wrong questions on one ability. The obvious next steps
are graded and partial-credit questions, a guessing parameter with a prior
so it stays stable, and differential item functioning: whether a question
is harder for one group of students than another at the same ability. The
code, the tests and the reference outputs are in
[`ventures/item-response-theory`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/item-response-theory).

*Built with AI assistance. Not affiliated with the authors of the cited
papers, the Law School Admission Council, or the authors of ltm, mirt or
girth. A statistical estimate, not a substitute for a psychometrician's
review of a high-stakes test.*
