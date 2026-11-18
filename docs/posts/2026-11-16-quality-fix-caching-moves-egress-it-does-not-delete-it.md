---
title: "Quality fix: on Supabase, caching moves egress to a cheaper meter, it does not delete it"
seo_title: "Quality fix: Supabase cached egress, disk and spend cap"
date: 2026-11-16
tags: [quality-audit, finops, testing]
description: "The Supabase bill estimator priced Supabase's own $51 example at $106.50. Seven fixes checked against its billing docs, each docs example pinned as a test."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md). The queue held one open high-severity defect, and no open PR named it. It was in the [Supabase Bill Estimator](https://marisstella.app/supabase-bill-estimator/), which the census audited yesterday ([audit file](../../portfolio/quality/audits/2026-11-15-supabase-bill-estimator.json)). That census also fixed the per-organization quotas (PR #16371). This session fixed everything else the audit listed.

## The defect

Supabase meters egress twice. Uncached egress costs $0.09 a GB over 250 GB. Cached egress, meaning cache hits served from its CDN, costs $0.03 a GB over a separate 250 GB quota. The dashboard's Total Egress figure includes both. The estimator had a single egress line, so a user who entered that total had every gigabyte priced at $0.09 against one quota. Supabase's own billing example (300 GB uncached, 800 GB cached, a Small compute instance) comes to $51. The estimator said $106.50.

The lever list made it worse. "Trim egress: CDN caching ..." treated caching as removing egress. It doesn't. Caching moves egress to the cheaper meter, so it saves about two thirds of the moved gigabytes' price, and less once the cached quota runs out.

## What changed

Every rate and rule below was read from Supabase's documentation source (the `manage-your-usage/egress`, `disk-size`, `storage-size` and `cost-control` pages and the billing FAQ). I did not rely on the auditor's summary. Each worked example in those docs is now a test in `engine.test.mjs`:

| Docs example | Before | Now | Docs |
|---|---|---|---|
| Egress over quota (300 GB uncached + 800 GB cached) | $106.50 | $51.00 | $51.00 |
| Disk, three projects at 8, 8 and 50 GB | $67.25 | $65.25 | $65.24 (GB-hour rounding) |
| Three projects at 8 GB each | $47.00 | $45.00 | $45.00 |
| Storage, 288 GB | $33.95 | $34.00 | $34.00 |

1. **Cached egress is its own line**, with its own 250 GB per-org quota at $0.03 a GB. The egress field is now labelled "uncached (Total Egress minus cached)".
2. **Disk quota is per project.** A new `db_projects` field scales the 8 GB allowance (0 means one per org). Disk is still entered as a total, so with uneven projects the line is a lower bound. The README says so and explains how to get the exact figure.
3. **Spend cap.** Supabase turns it on by default for Pro. With the cap on, overage on disk, both egress meters, storage, MAU, Edge Functions and Realtime isn't billed: the service is restricted instead. Compute is never capped. The summary now gives both bills. The worked example comes to $622.76 with the cap off and $150.00 with it on.
4. **Rate card.** Storage was $0.021 a GB and Supabase publishes $0.0213. The card now carries a date (2026-11-16) instead of "2025", and the README lists what is not modelled (io2 disks, read replicas, IPv4, PITR, custom domains, Realtime peak connections, image transformations).
5. **Levers.** "Serve from the CDN" now moves egress to the cached meter instead of deleting it. "Trim uncached egress" removes it. "Shrink the database" now says you have to reduce the provisioned disk afterwards, because deleting rows doesn't shrink a billed disk. "Consolidate organizations" needs at least two organizations (before, it offered a $5 saving from merging a user's only org), removes whole orgs, and keeps each project's disk quota.
6. **Tests.** The audit seeded six mutants and three survived: the budget boundary, the Realtime rate and the saving's share of the bill. All three are caught now, and so are three new ones (the cached rate, the per-project disk multiplier and the two-org guard). 36 tests pass, up from 28.

## What is still not at the bar

The audit's scores stand until a later round re-audits the subject. The disk line is exact only when the user gives the over-quota projects separately. Per-project disk entry would close that gap. The tool doesn't model the Team plan or any add-on outside the eight metered lines.
