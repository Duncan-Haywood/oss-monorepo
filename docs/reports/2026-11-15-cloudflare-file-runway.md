---
kind: analysis
subjects: [pages, marketing]
topics: [hosting, ci, seo]
date: 2026-11-15
title: The site's two Cloudflare Workers fill their 20,000-file limits in one to two weeks
description: Deploy logs show 31,439 files across two Workers capped at 20,000 each, growing about 930 a day; IndexNow already broke at its own 10,000-URL limit.
---

# The site's two Workers fill their 20,000-file limits in one to two weeks

Source: the `deploy-cloudflare` job of Portfolio Pages on `main`, lines
printed by `platform/pages/cloudflare/split.mjs` ("site Worker: N files;
shard Worker: M files") and `platform/marketing/indexnow.mjs` ("indexnow: N
URL(s)"), read with `gh api repos/.../actions/jobs/<id>/logs` on 2026-11-15.

| run (UTC) | site Worker | shard Worker | IndexNow URLs |
|---|---:|---:|---:|
| 2026-11-08 12:03 (42478114714) | 16,092 | 9,294 | 7,686 |
| 2026-11-11 11:54 (43014950939) | 16,414 | 10,462 | 8,365 |
| 2026-11-13 12:00 (43420174002) | 17,134 | 11,861 | 9,126 |
| 2026-11-15 04:56 (43678613213) | 17,722 | 13,100 | 9,831 |
| 2026-11-15 10:58 (43706234491) | 17,792 | 13,282 | 9,929 |
| 2026-11-15 14:40 (43724852899) | 17,837 | 13,602 | 10,002 (refused) |

## What broke today

IndexNow takes at most 10,000 URLs per request. `indexnow.mjs` refused to
send more rather than batch, so from the 14:40 deploy on, every announcement
failed. The step is soft (it must not hold back the GitHub Pages redirect
deploy), so the job stayed green and nothing reached IndexNow. Fixed in this
PR: the CLI now sends batches of at most 10,000 (`batches`,
`submitInBatches`, tests in `indexnow.test.mjs`).

## What breaks next

`split.mjs` fails the deploy, before any upload, once either Worker holds
more than 20,000 files. Then no merge reaches the site.

- Site Worker: +1,745 in 7.1 days (about 245 a day), but +703 in the last
  2.1 days (about 330 a day). 2,163 left: **about 7 to 9 days, so around
  2026-11-22 to 11-24.** The `::warning::` at 90% (18,000) fires in about
  half a day.
- Shard Worker (`research/`, `writing/`, `dev/`): +4,308 in 7.1 days (about
  600 a day). 6,398 left: about 10 days.
- Both together: 31,439 of 40,000, growing about 930 a day. Moving a
  directory from one Worker to the other (the README's advice) buys only
  days, because both are filling.

## Options, for the owner

1. **Workers Paid, $5 a month**: 100,000 files per Worker
   (`platform/pages/cloudflare/README.md`). Simplest. Money, so the owner's
   call.
2. **A third free Worker shard.** No money, but it changes
   `.github/workflows/portfolio-pages.yml` (a control-plane path), adds a
   second service binding, and puts more paths through `router.mjs`, whose
   runs count against the free plan's 100,000 requests a day.
3. **Fewer files per page.** Not measured here: which build outputs
   dominate the count is the next reading to take (run `split.mjs` on a
   local build and count by extension and top directory).

Without one of these, deploys stop in about a week.
