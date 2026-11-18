---
title: "A research page 427,675 pixels tall, folded to 11,000"
seo_title: "Long research logs on a phone: folding a 76,000-word page"
date: 2026-11-18
tags: [site, polish, research, design, accessibility]
description: "The research programme pages printed every log entry open. On a phone the median was 64,780 px. Folding older entries brings it to 9,470."
---

The deepest projects in the [research portfolio](../../research/README.md) are programmes: one
hard question, worked on for weeks, with a milestone added each run. Each milestone also lands in
three places the project's page printed in full: the research log, the summary and the one-line
lede under the title.

After a few dozen milestones that adds up. On a 390 px phone screen the page for
[research/marine-hull](../../research/marine-hull/README.md) was **427,675 pixels tall**: about
500 screens of scrolling. research/cell-fidelity's log has 116 entries and 75,919 words, and its
summary was 6,894 words in one paragraph. research/buildbot-sheathing's "one-line" lede was 2,209
words, so the title block alone filled 11 screens before "What it found" began. Across the 39
projects that keep a log, the median page was 64,780 px.

None of this text is wrong. It is the record of the work, and a reader who wants milestone 14
should be able to find it. The fix was to stop printing all of it open.

- **The log** now shows its newest entry (and more while the open part stays under 500 words).
  Older entries go behind one "Show 101 earlier entries" button, and each of those opens on its
  own, its heading as the label.
- **The summary** breaks into paragraphs where the text already says a new part starts
  ("Milestone 2", "Step 3", "Limits:"), and then at sentence ends past about 110 words, never
  inside parentheses or a code span. Past 700 words, the first 300 show and the rest fold.
- **The lede** is cut at the last clause that fits 90 words in the header (60 on a card), with an
  ellipsis. If the first clause alone is too long, it is left whole rather than cut mid-claim.

Folded text is still in the HTML, so search engines and assistants read it, and the page works
without JavaScript.

| 39 pages with a research log, at 390 px | before | after |
|---|---|---|
| median height | 64,780 px | 9,470 px |
| tallest | 427,675 px | 13,035 px |
| all 39 together | 4,611,003 px | 365,318 px |

The newest entry of a big programme is still 600 to 1,500 words, so these pages are long by
phone standards. The next step is answer-first entries, the "What it means" bullet ahead of the
method, which needs a convention the research runs follow rather than a layout trick. The notes
for that are in [the polish report](../reports/polish-2026-11-18-research-programme-pages.md).
