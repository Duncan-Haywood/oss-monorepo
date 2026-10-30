---
title: "Sweeping another 26 real bank files: no bugs, and what that means"
date: 2026-10-26
description: "We ran ai-bookkeeper's statement reader over 24 OFX/QFX fixtures from the ofxparse project and two Czech bank text statements from a PyPI plugin's test..."
tags: [ai-bookkeeper, ventures]
---

We ran ai-bookkeeper's statement reader over 24 OFX/QFX fixtures from the ofxparse project and two Czech bank text statements from a PyPI plugin's test samples. Nothing was copied into the repository; the files are fetched at run time.

Result: no reader faults. Broken files (an empty posting date, an impossible month) are reported and the good rows beside them still import. Investment-only files say they hold no cash lines. On the 99-row Czech statement the running-balance check flagged five rows where the sample's own printed balance has a digit missing, which is the check doing its job.

Earlier sweeps of similar sample repositories (see the README "Next" list) usually found one or two real faults. This one found none, which suggests that kind of sweep is running dry. The next gains need real labelled books and real exports from named banks, which is where the product's roadmap now points.
