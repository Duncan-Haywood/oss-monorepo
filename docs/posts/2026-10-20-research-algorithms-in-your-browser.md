---
title: "Research algorithms in your browser: changepoints, conformal intervals and matrix profiles"
seo_title: "Research algorithms in your browser"
date: 2026-10-20
description: "Three methods from published statistics papers as free tools on your own CSV: in the browser, the command line and AI agents, with the papers cited."
tags: [projects, statistics, machine-learning, time-series, open-source]
---

# Research algorithms in your browser: changepoints, conformal intervals and matrix profiles

Most of the 1,300 tools in this repository are calculators: a bid, a fee, a
tax threshold. On 2026-10-20 the owner set a new direction: tools built
from **methods in published research papers**, run on the visitor's own data,
licences respected and the papers credited, and usable by AI agents as well
as people. The rules are in
[`portfolio/research-tools/README.md`](/portfolio/research-tools/README.md).
This post covers the first three. AI coding agents (Claude sessions) built
them, with the owner steering.

Each one runs in a browser tab with nothing uploaded. Each ships a
zero-dependency CLI (`node cli.mjs --help` prints the citations) and an
engine that the repository's agent layer can call
(`node platform/agents/tools.mjs describe <slug>` now prints each paper in
full). Each comes with a real public dataset as its example.

## 1. When did this series change? Changepoint detector

[Live tool and source](/ventures/changepoint-detector/README.md)

Two methods run side by side:

- **PELT** (Killick, Fearnhead & Eckley 2012, *JASA*) finds the exact best
  segmentation under a penalty per change.
- **Bayesian online changepoint detection** (Adams & MacKay 2007) gives a
  probability for each candidate change.

The example is the annual flow of the Nile at Aswan, 1871–1970. That is the
textbook case: Cobb (1978) found the level dropped after 1898. The tool
reports the same thing:

- segments 1871–1898 (mean 1097.75) and 1899–1970 (mean 849.97);
- a Bayesian probability of 79% at 1899, the only point above 50%.

That matches R's `changepoint` package (`cpts = 28`).

Two tests check the implementations are exact, not approximately right:

- PELT's answer equals a brute-force search over all segmentations on 25
  random series.
- With the hazard driven to zero, the Bayesian recursion's evidence equals the
  closed-form Normal-Inverse-Gamma marginal likelihood.

One honest number from the tests: on pure noise of length 300, the default
BIC penalty still invents a change in about one series in ten.

## 2. How wide must a prediction interval be? Conformal prediction intervals

[Live tool and source](/ventures/conformal-prediction-intervals/README.md)

Conformal prediction gives intervals that cover a chosen share of new cases,
with a finite-sample guarantee and no assumption about the error
distribution. The tool fits three variants and checks each on held-out rows:

- split conformal (Lei et al. 2018);
- a locally weighted version;
- conformalized quantile regression (Romano, Patterson & Candès 2019), with
  its own exact linear-programming quantile fit.

On the diabetes data from Efron et al. (2004), at a 90% target with one seeded
split, split conformal covered 90.1% of the 111 test rows (100 of 111) at a
mean width of 182.0. CQR covered 93.7% at 180.7. Averaged over 200 random
splits, all three land between 90.2% and 90.4%. That is what the guarantee
promises: correct on average over splits, noisy on any one split.

## 3. What repeats, and what is unlike anything else? Matrix profile explorer

[Live tool and source](/ventures/matrix-profile-explorer/README.md)

The matrix profile (Yeh et al. 2016; Zhu et al. 2016, both ICDM) gives, for
every window of a series, the distance to its closest match elsewhere in the
series. Low values are **motifs** (repeated patterns); high values are
**discords** (anomalies). The tool computes it exactly with STOMP. It agrees
with a brute-force implementation and with the outputs of STUMPY, a
widely used library, to within 1e-10 on the test series.

On NOAA's Mauna Loa monthly CO2 record, with a 12-month window:

- The closest repeat is the year starting September 2014 and the year starting
  September 2024 (distance 0.1394; correlation 0.9992).
- The most unusual year is the one starting January 2024 (distance 0.7474).

A discord says a stretch is unusual, not why. The README notes that NOAA's
file includes months measured at Maunakea rather than Mauna Loa near then.

## What's next

The [spec](/portfolio/research-tools/README.md) lists the next papers, each
one a job someone has:

- synthetic control, for "did my intervention work";
- Kaplan–Meier and Cox models, for churn;
- Sinkhorn optimal transport;
- Gaussian-process regression;
- isolation forests;
- robust PCA;
- STL decomposition;
- false-discovery-rate control.

Desktop packaging is also queued. The repository already builds iOS,
Android, npm, MCP and browser-extension packages, and these tools qualify for
them.

These are statistical tools on data you supply. They are not advice. Check
any result before you rely on it.
