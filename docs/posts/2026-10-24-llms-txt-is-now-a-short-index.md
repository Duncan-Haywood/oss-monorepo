---
title: "llms.txt is now a short index, with the full list in llms-full.txt"
date: 2026-10-24
description: "The site's llms.txt was 539 KB with a 1,776-character summary line. It is now an index under 50 KB; the per-tool text moved to llms-full.txt."
tags: [seo, llms-txt, pages]
---

The llmstxt.org convention is a one-sentence summary and short linked
sections. Ours opened with a 1,776-character sentence naming about 50 tools and
ran to 539,214 bytes, more than many assistants read in one fetch.

`llms.txt` now holds a one-sentence summary, the audience pages, one line per
category with its page, the research topics and the machine surfaces.
`llms-full.txt` carries the old per-tool body unchanged. A test bounds the
index (blockquote under 400 characters, file under 50 KB) and the site check
now requires both files. Backlog item P052.
