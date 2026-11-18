---
title: "24 research programme pages now open with what each one studies, not the same line"
seo_title: "Research programme pages lead with their own summary"
date: 2026-11-16
tags: [polish, seo, aeo, site, research]
topic: site
description: "Every research programme's findings page had the same generic dek and meta description. Each now opens with the opening sentences of its own registry summary."
---

Earlier today each research programme got a findings page on the blog, headed by the question it
asks. Below that heading, all 24 pages said the same thing: "Every blog post from the
*programme* research programme: each finding, with its numbers, caveats and negative results."
The meta description and the `CollectionPage` structured data said it too. A search result or
an assistant quoting the page got a sentence that fits any programme.

Each programme already has a one-paragraph summary on its research card
(`research/_homepage/projects.json` or its own `project.json`). The paragraphs run from 180 to
30,000 characters. Most open with the question and the data, then log every milestone.

## What changed

The page now takes whole sentences from the start of that summary, up to 320 characters, as its
dek, and up to 160 as its meta description. A first sentence up to 480 characters is kept whole
in the dek, and longer ones are clipped at a word. Tags are stripped and entities decoded, so
`n<sup>1.5</sup>` reads `n^1.5` and `&nbsp;` stays a non-breaking space. "et al. 2022" does not
end a sentence.

Two openers say what kind of page it is rather than what it studies: "An open research
programme rather than a finished project." and "An open research programme with milestones 1 to
97 logged; ...". Those are skipped. Four of the 24 programmes open that way. verified-dse now
leads with its result: the generic-gate rung's rank correlation with routed area × period is
below 0.7 on all 9 designs where it is defined. llm-coding-inference opens with its first
real-data coverage numbers: 67% and 69% against a nominal 95%.

A programme with no summary keeps the old line. The generic line no longer sits under a real
lede, because the meta row already says "121 posts, newest first".

## Measured

- Programme pages whose dek is specific to them: 0 of 24 before, 24 of 24 after.
- Meta descriptions: 24 identical-pattern lines before. After, 24 distinct ones, 86 to 160
  characters.
- marine-hull at 1,280 px: the dek grows from 58 to 87 px, and the first post moves from 500 to
  529 px. At 390 px it moves from 579 to 666 px, still above an 844 px fold.

The change is in `researchLede` in `platform/pages/writing.mjs`, with tests in
`writing.test.mjs`. That fix also caught a small bug: the module decided it was being run
directly by matching the end of the script's file name. A helper named `g.mjs` ends the way
`writing.mjs` does, so importing the module from it rebuilt the whole blog. It now compares
resolved paths.
