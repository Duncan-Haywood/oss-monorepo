---
title: "Quality fix: one stray URL could sink the whole IndexNow request"
seo_title: "Quality fix: IndexNow URLs scoped to the declared host"
date: 2026-11-14
tags: [quality-audit, platform, seo]
description: "A fix-mode session closed three of five open defects in the IndexNow announcer: off-host URLs, typo'd flags that ran a dry run, and a miscount."
---

This session ran the quality programme in `fix` mode
(`python3 platform/ci/quality_audit.py mode`). No high-severity defects were open, so it took
medium ones from the queue. It chose `platform/marketing`, the script that tells Bing, Yandex,
Seznam and Naver which pages this site has. The
[2026-11-07 audit](../../portfolio/quality/audits/2026-11-07-marketing.json) found five
defects and none had been fixed. This session fixed three.

## The defect that mattered: the protocol rejects the whole batch

An IndexNow request declares one `host` and a `keyLocation`. According to the
[IndexNow documentation](https://www.indexnow.org/documentation), a request with a URL on
another host, or outside the folder the key file covers, is rejected as a whole with a 422. The
script builds its URL list from `catalog.json` and every child sitemap. It checked that each
*child sitemap* sat under the site, but it never checked the URLs inside those sitemaps. The
auditor built a fixture with `https://evil.test/x/` and `https://example.test/outside/` in a
child sitemap, and both went into the dry-run payload. A single bad `<loc>` from a build bug
would have cost the announcement for all of the site's pages.

`scopeToSite` now keeps a URL only when its scheme and host match the base URL and its path
starts with the base path. Everything else is dropped, and the CLI prints how many URLs it
dropped and the first five. A drop that happens on every run stays visible.

## Two smaller ones

- **A typo ran a dry run.** `--sumbit` was ignored without a word, so the script did a dry run
  and exited 0, which looked like it had worked. Unknown flags and a flag missing its value now
  exit 2. A missing git ref or a bad `--base-url` now prints one line instead of a Node stack
  trace.
- **The count was wrong.** The sources line said `from 3 published sitemap(s)` even when two of
  the three had been skipped. It now says `from 2 of 3`.

## How it was checked

- `node --test platform/marketing/indexnow.test.mjs`: 44 pass, 0 fail (6 new tests).
- `pytest platform/ci/test_indexnow_state.py`: 38 passed. That reader parses this script's
  output, so the changed sources line had to keep parsing.
- Two bugs were seeded into the new filter with `platform/ci/quality_mutate.py`: removing the
  host check, and replacing the path check with `true`. The tests caught both.

## What is still open

The audit's other two defects are still open. The script resubmits the full catalogue on every
run instead of only the URLs that changed, and it reports 200, 202, 422 and 429 the same way.
Even 200 or 202 only means "asked", because IndexNow has no confirmation API. These are now
listed in the subject's README. The audit's scores stay as they were before the fix, and a later
round re-audits the subject in a new file.
