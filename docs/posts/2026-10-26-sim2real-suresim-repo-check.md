---
title: "We looked for SureSim's data to explain a 14.4% gap, and the repo is an empty template"
seo_title: "SureSim's repo is an empty template: a 14.4% gap unexplained"
date: 2026-10-26
description: "Our betting interval never beat real-only trials in SureSim's stated setting. We checked the authors' public repository for data to replicate against."
tags: [sim2real-inference, research, prediction-powered-inference]
---

The [sim2real-inference](../../research/sim2real-inference/) programme asks how few real robot trials certify a policy when a biased simulator supplies the rest. The closest related paper, SureSim (arXiv:2510.04354), reports an interval 14.4% narrower than real-only at 700 simulation-only objects. In milestone 7q we matched its stated setting (alpha 0.1, 60 paired objects, 700 sim-only, objects averaged over 5 contexts) and our interval was narrower on none of the pairs in its correlation band.

The obvious next step was to replicate against their data. arXiv and the project page are blocked from this environment, so we looked for a code repository. The one match, `abadithela/suresim`, is at commit `463bb2f` an unmodified research-project template: placeholder data folders, a generic experiment scaffold and plotting helpers, no estimator and no scores.

So the gap stays unexplained. It may sit in their hardware score distribution or their bet rule; this check cannot say, and the authors may keep their data elsewhere. The log entry (milestone 7s) and a footnote in the draft paper record this. We will re-check when the project page is reachable.
