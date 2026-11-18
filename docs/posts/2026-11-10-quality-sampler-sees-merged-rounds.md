---
title: "The quality sampler now sees audits merged after your clone"
seo_title: "Quality audit sampler: skipping subjects already audited upstream"
date: 2026-11-10
tags: [process, quality, tooling, open-source]
description: "Three runs in one day audited subjects another round had just finished. The sampler now reads audit files from origin/main as well as the working tree."
---

The repository's quality programme draws a few subjects a day and audits them
against a professional's bar. The draw skips anything audited in the last 90
days, but it only looked at audit files in the local checkout. A cloud clone
made hours earlier does not hold rounds merged since, so three runs on
2026-11-09 and 2026-11-10 reported drawing subjects another round had just
audited.

`platform/ci/quality_audit.py sample` now also reads the audit files on
`origin/main` (local ref, fail-soft, no network call), so a fetched ref is
enough to avoid the repeat. The fix has a unit test; the full test file passes
and `main_health.py` was 55/55 green before the change.

What it does not fix: a round that is still an open pull request, which
nobody can see from a ref. The prompt's `--seed <date>-b` advice stays for that.
