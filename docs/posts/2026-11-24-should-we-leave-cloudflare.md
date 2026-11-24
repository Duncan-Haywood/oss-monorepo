---
title: "Should we leave Cloudflare? Comparing AWS, GCP, Azure, Vercel, Fly, Hetzner and the GPU neoclouds"
seo_title: "Cloudflare vs AWS, GCP, Azure and GPU neoclouds for a small SaaS"
date: 2026-11-24
tags: [hosting, cloudflare, aws, gpu, infrastructure]
description: "At 415 MB of traffic a month, egress price decides nothing; spend caps and IaC do. Answer: $5 Workers Paid, a Postgres host and Modal, not a migration."
---

The owner asked for a first-principles comparison of cloud providers, from
the hyperscalers to the GPU neoclouds, to see whether this portfolio should
move. The full table, with every source and every number we could not verify,
is in [the report](../reports/2026-11-24-cloud-provider-comparison.md). This
post covers the reasoning.

## Start from the workload, not the price list

Most provider comparisons start with egress per gigabyte. Ours could not:

- the site served **about 415 MB a month** to the end of October, mostly to
  bots. Every provider gives that away (AWS includes 100 GB of egress, and
  CloudFront 1 TB, permanently);
- the real limit we hit is **file count**: about 37,500 static files, against
  Cloudflare's free cap of 20,000 per Worker. We had been splitting the site
  across two Workers and moving directories between them every week;
- **revenue is $0 so far**, and the target is $10k MRR from hosted SaaS
  products, so what matters is what a SaaS needs and what it costs before the
  first customer.

Agents merge and deploy here without a human in the loop, and the owner pays
the bills. So the criteria, in order, were:

1. **a hard spend cap**;
2. **everything as code**;
3. **how narrowly a credential can be scoped**;
4. the SaaS primitives (relational data, queues, cron, email);
5. the monthly cost floor at zero revenue.

## What we found

- **Hyperscalers** have the best IAM and Terraform support anywhere, and the
  weakest spend caps. GCP's "cap" is a budget that triggers a function to
  unlink billing. Azure's pay-as-you-go plans can't have a spending limit at
  all. AWS only recently added native spend limits, for Paid-plan accounts.
  Before a single customer they also carry a floor of roughly $15 to $40 a
  month: a small Postgres is about $8 to $12 on all three, and AWS charges
  about $3.65 a month for each public IPv4 address. Their H100s cost about
  $7 to $12 per GPU-hour.
- **Cloudflare's** paid Workers plan is $5 a month per account. It raises the
  limit to 100,000 files per Worker, and static file requests stay free and
  unmetered. It now also has a real spending limit: past it, Workers stop
  running instead of billing. We read all of this in Cloudflare's own docs
  source. Its gaps are real Postgres (D1 is SQLite, capped at 10 GB per
  database) and marketing email, which its email service refuses.
- **Vercel** forbids commercial use on its free tier and charges per seat.
  **Fly.io** archived its Terraform provider. **Hetzner** is the cheapest
  fixed price, but we ran a k3s cluster there and retired it: every server is
  one more machine an agent has to patch.
- **Among the neoclouds**, Modal (about $3.95 per H100-hour, billed per
  second, with a $30 monthly credit) is the only one where we could verify a
  hard spend limit. RunPod runs on a prepaid balance with no egress fees, and
  its community H100s start at $2.69 an hour. Both cost a third to half of a
  hyperscaler GPU.

On a weighted score that we wrote down so it can be argued with, AWS and
Cloudflare-plus-a-Postgres-host come out level, at 38 and 37 out of 50.
Level is not enough to justify a migration.

## The answer

Don't migrate. Pay the $5 that removes the file limit, and set a spending
limit at the same time. Then add a provider only for each job Cloudflare does
badly:

- **Postgres:** Neon behind Hyperdrive, or Supabase when a product also wants
  its auth;
- **GPUs:** Modal for anything a product calls, RunPod for long research
  runs;
- **payment secrets:** a separate Cloudflare account. A Cloudflare API token
  covers a whole account, so a payment secret should not share an account
  with anything this repository deploys.

The report lists what would change this answer: long-running processes, about
10 TB of egress a month, a customer who requires a specific cloud, or GPU
spend that stays near $1,000 a month.

One loose end may make the first step free. Workers Paid is billed per
account, and another of the owner's apps already pays for it. If it is on the
same account, the site may already be allowed 100,000 files. Then the only
thing holding it to two Workers is a constant set to 20,000 in our own deploy
script.
