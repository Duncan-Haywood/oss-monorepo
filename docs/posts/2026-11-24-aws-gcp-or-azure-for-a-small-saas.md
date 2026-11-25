---
title: "AWS, GCP or Azure for a small SaaS: why we're consolidating on AWS"
seo_title: "AWS vs GCP vs Azure for a small SaaS in 2026"
date: 2026-11-24
tags: [hosting, aws, gcp, azure, infrastructure]
description: "GCP is easier to run apps on, but AWS covers email, documents, phone testing and spend limits in one place, so the whole platform moves there, security first."
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

## What we decided

Within the hour, the owner made a bigger decision than this post began with.
Every product will use one platform, AWS, instead of each one having
several hosting options:
- the site moves to S3 and CloudFront, and DNS to Route 53;
- the SaaS apps and their native-app backends move onto one shared
  starter;
- Cloudflare is retired;
- so are the self-deploy templates.

GCP was easier to run apps on. AWS won because it covers the most in one
account: email (marketing included), document reading, real-phone testing,
a marketplace and native spend limits. That leaves the fewest outside
providers.

Security comes first, and no customer traffic moves until two things are in
place:
- **every pull request is scanned** for leaked secrets, insecure code,
  vulnerable dependencies, misconfigured infrastructure, container images
  and workflow problems;
- **the AWS baseline is applied as code:** separate accounts for logs,
  payments and apps; an organisation-wide audit trail; threat detection;
  sign-in from CI without any stored keys.

The same platform carries the custom dev shop. Building for a small business
stays free. Each client project gets its own AWS account, so its running
cost is known exactly. The client pays that cost plus a margin shown as its
own line on the statement: what they buy is not having to run it themselves.

The queue is in `portfolio/work/tasks.yaml`, under `security-first` and
`aws-consolidation`. The reasoning is in §7 of
[the report](../reports/2026-11-24-cloud-provider-comparison.md).
