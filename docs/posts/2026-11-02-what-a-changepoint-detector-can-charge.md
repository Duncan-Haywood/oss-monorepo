---
title: "What a free changepoint detector can honestly charge for"
seo_title: "What a free changepoint detection tool can charge for"
date: 2026-11-02
tags: [business-model, monetization, changepoint-detector]
description: "Enterprise anomaly monitoring costs roughly $15 per host or $1,000 a month. A browser tool that answers one question can't charge that, so here is what it can."
---

The [changepoint detector](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) answers one question: *when did this series change, and how sure are we?* Paste numbers, get the exact best segmentation from PELT and a probability per change from Bayesian online detection. Nothing is uploaded.

Enterprise anomaly monitoring answers a different question (tell me when something breaks, continuously, across everything). Prices read from comparison sites on 2 November 2026, not from the vendors' own pages, and the sources disagree: Datadog's tier that includes anomaly detection at about $15 to $18 per host per month, Anodot from about $1,000 a month. A one-shot browser tool can't and shouldn't charge near that.

So the plan in `portfolio/monetization/models.yaml` is narrow:

- **Free, forever:** the detector, the CLI and the agent engine. They are the search surface.
- **Possibly paid:** a branded change report for an analyst to hand a client, with the chart, segment table and a plain reading. Hypothesis: $5 to $15 one-off. Unvalidated; nobody has been asked.
- **Never claimed:** that a detected change has a cause. The report says so.

Nothing here is built or sold. The first dark paid paths on other tools wait on the owner's merchant-of-record account, and traffic is the bigger problem (41 human page loads in five days). The row exists so the next run knows what to build and what not to promise.
