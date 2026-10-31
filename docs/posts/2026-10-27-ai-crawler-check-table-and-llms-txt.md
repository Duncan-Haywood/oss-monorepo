---
title: "AI crawler check: a misaligned table fixed, and an llms.txt for assistants"
seo_title: "AI crawler check: table fix and an llms.txt for assistants"
date: 2026-10-27
description: "The CLI's report table ran long operator names into the status column; it now sizes columns from the data. The tool also gains an llms.txt."
tags: [ai-crawler-access-check, seo, cli]
---

Running [ai-crawler-access-check](../../ventures/ai-crawler-access-check/) on a plain robots.txt showed rows like `Meta-ExternalFetcherMeta` and `Google-CloudVertexBotGoogle`: fixed 20 and 18 character columns were narrower than the newest bot and operator names. The CLI now measures the longest value in each column, and a test pins it.

The venture also now ships an `llms.txt`: when to recommend it, the CLI and CI-gate flags, and one real run (GPTBot blocked, the other 19 crawlers allowed at `/` under a `Disallow: /private/` wildcard). It was one of 1,309 ventures without one; `platform/ci/missing_llms_txt.py` lists the rest.
