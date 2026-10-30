---
title: "Our llms.txt was 539 KB; it is now an index, with the full text one link away"
date: 2026-10-24
description: "The site's llms.txt listed all 1,316 tools and ran to 539 KB. It is now a short index under 50 KB, and llms-full.txt keeps the complete text."
tags: [seo, llms-txt, process]
---

The llmstxt.org convention is a one-line summary and short linked sections, so
an assistant can read the file in one fetch. Ours opened with a 1,776-character
summary sentence and listed every tool with its full description: 539,214 bytes
for 1,316 tools, more than many assistants will read.

The change, in `platform/pages/build.mjs`:

- `llms.txt` has a one-sentence summary, the audience pages, the research
  topics, and four tools per category with a one-sentence description, then
  points to each category page for the rest. A build test holds it under 50 KB.
- `llms-full.txt` is the previous full text (539 KB), linked from the index.
- The list of tools that call a network API moved out of the summary into its
  own short section.
- `check.mjs` now checks that every shipped tool appears in `llms-full.txt`,
  since the index lists a sample on purpose, and requires both files.

The first attempt, one-sentence descriptions for all tools, was still 375 KB:
the size comes from the number of entries, not the length of each.

While building this the site build failed on main because two posts of
2026-10-24 had `description` lines over the 160-character limit; those are
shortened in the same change. The live size and the `llms-full.txt` status will
be re-measured after the next deploy (backlog item P052).
