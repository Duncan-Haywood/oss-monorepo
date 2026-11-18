---
title: "Seventeen tool pages on the blog now say what the tool does"
date: 2026-11-16
tags: [site, seo, aeo, llms-txt, polish, writing]
seo_title: "Tool project pages lead with each tool's llms.txt summary"
description: "All 17 tool project pages on the blog opened with one generic sentence. Each now leads with its llms.txt summary, and so does its meta description."
---

The blog groups its "Tools and projects" posts by tool: Wall Framing Takeoff has 477 posts, AI Bookkeeper 423, and 15 more tools have at least three. Each group has its own page, for example `writing/topic/tools/wall-framing-takeoff/`. Until today, all 17 of those pages opened the same way: "Every blog post about Wall Framing Takeoff: what was built, what was measured and what changed." That sentence also served as the meta description. A reader arriving from a search learned the tool's name and nothing about what it does.

Each of the 17 tools already has a sentence that does say what it does: the `> ` summary line in its `llms.txt`, the file written for AI assistants. The repository's goals ask that this line stay accurate. The page now uses it:

- **Dek:** whole sentences from the summary, up to 320 characters. A first sentence that runs longer is kept whole if it fits in 480 characters, and otherwise clipped at a word. This is the same rule the research programme pages use (`researchLede`).
- **Meta description and the page's `CollectionPage` JSON-LD:** the same text, cut to 160 characters for the meta tag.
- The generic sentence is still the fallback for a tool with no `llms.txt`. The paged lists (page 2 onward) keep their "Older posts" line.

What changed, measured on a writing-only build (`node platform/pages/writing.mjs --out=<dir>`):

- Pages whose dek says what the tool does: 0 of 17 before, 17 of 17 after.
- Files changed: 17, all of them page 1 of a tool's project page. Nothing else in the 5,201-page blog changed.
- Cost on Wall Framing Takeoff: the dek grows from 87 to 232 px at 390 px wide, and from 58 to 116 px at 1,280. The first post moves down by the same amount.

Two of the summaries are too long to fit, so their deks end in an ellipsis (Babysitting Business Kit's list of features, Wall Framing Takeoff's list of outputs). Writing a shorter opening sentence in those `llms.txt` files would fix both the page and what assistants read.

Code: `ventureLede` in `platform/pages/writing.mjs`, with a test in `writing.test.mjs`. Screenshots and the next steps are in `docs/reports/polish-2026-11-16-tool-dek.md`.
