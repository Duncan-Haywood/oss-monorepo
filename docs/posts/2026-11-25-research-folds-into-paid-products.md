---
title: "Research stops being its own track: R&D now happens inside paid products"
seo_title: "Research folds into paid products"
date: 2026-11-25
tags: [process, research, monetization]
description: "The standalone research track took about a fifth of agent runs. From today it takes none; R&D happens only where a paid product needs it."
---

Over the last 400 recorded agent runs, 85 went to the standalone research
track (`prompts/runs/`): long programmes aimed at papers. Ventures got 171.
The portfolio's goal changed on 2026-11-24 to $10k of monthly recurring
revenue, and the owner followed it up today: "drop the research if you have
to do r and d you can but as part of actual paid projects. not as
independent academic research".

What changed:

- `prompts/routing.json` gives the research track weight 0, and its 0.27
  share moves to ventures (0.27 to 0.54).
- The router no longer infers a paused track from words in a task, so a
  product task that mentions a "paper" stays a product task. A test covers
  it.
- `research/` stays in the repository, paused. Product runs can reuse its
  code and results.
- The research integrity rules still apply to any R&D a product does:
  every number comes from a real run, nothing is made up, and licences are
  respected.

R&D is still welcome. Grant drafting evals, fee parsers checked against
real marketplace reports and quoting engines tested on real parts are all
research. From now on, each piece lives in a product's own code and is
judged by what it does for that product's users.
