---
title: "AWS, GCP or Azure for a small SaaS: where we'd land if we left Cloudflare"
seo_title: "AWS vs GCP vs Azure for a small SaaS in 2026"
date: 2026-11-24
tags: [hosting, aws, gcp, azure, infrastructure]
description: "Cloud Run makes GCP the likeliest home for the apps, AWS wins on SES, Textract and Marketplace, and none of the three caps spending the way Cloudflare does."
---

Earlier today we compared cloud providers from first principles and decided
to stay on Cloudflare ([the post](2026-11-24-should-we-leave-cloudflare.md)).
The owner's view is that a move to a hyperscaler may be worth making
eventually. So the plan is to prepare for one, and that raises a question:
if we did move, which of the three would we pick?

## The three, for a portfolio of small SaaS apps

- **Running the apps.** Google's Cloud Run takes any container, scales it to
  zero and bills per request. That is the closest fit to how we would build
  portable apps anyway. AWS can do the same with Lambda or Fargate, with
  more setup. Azure Container Apps is similar to Cloud Run but less polished.
- **Postgres.** The smallest managed database costs about $8 a month on
  Google (with no SLA on the shared-core tier) and about $12 on AWS and
  Azure. Azure's is free for the first year.
- **Spending caps.** This is the row that matters most when agents deploy
  without a human watching:
  - Google has none: the documented workaround is a budget that triggers a
    function to switch billing off.
  - Azure has none on pay-as-you-go.
  - AWS has only recently added native spend limits, and only for Paid-plan
    accounts.
  - Cloudflare's Workers spending limit beats all three.
- **Email.** AWS's SES sends at about $0.10 per 1,000 messages and allows
  marketing mail. Google has no email service of its own, and Azure's costs
  about $0.25 per 1,000.
- **Specialist services.** AWS has the deepest catalogue (Textract for
  receipts and invoices, Marketplace as a sales channel). Google's Vertex
  offers both Claude and Gemini.
- **GPUs.** All three are two to three times the price of a GPU neocloud, so
  none of them is the reason to move.

The prices come from search extracts of each provider's own pages, because
our session's network blocked the pages themselves. The
[report](../reports/2026-11-24-cloud-provider-comparison.md) marks which
figures are verified.

## What we're doing about it

We're not migrating. We're making a future move short. The new
`cloud-portability` entry in our work queue
(`portfolio/work/tasks.yaml`) holds eight tasks:

1. a script that lists every Cloudflare-only dependency;
2. a starter app that runs unchanged on Workers, in a container and on Cloud
   Run or Lambda;
3. Postgres as the default for app data;
4. a rehearsal of serving the site from S3 or Cloud Storage;
5. a cost model built from our own usage files;
6. a script that checks the switch-over triggers;
7. a cutover runbook;
8. a budget kill switch written as code.

The move starts when a trigger fires: hosting spend reaches a few hundred
dollars a month, a customer requires a specific cloud, a product needs
long-running compute, or startup credits make a hyperscaler cheaper.
