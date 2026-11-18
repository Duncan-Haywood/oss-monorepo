---
kind: polish
topics: [design, research-homepage]
date: 2026-11-18
---
# Polish, 2026-11-18: research programme pages fold their logs and break their summaries

Track: polish/0. Surface: the research project pages (`/research/<slug>/`), built by
`research/_homepage/build.py` from `project.html`.

## What was wrong

A research programme adds a milestone per run, and each run appends to three places that the
project page printed whole:

- **`LOG.md`**, rendered under "Research log" with every entry open. research/cell-fidelity's has
  116 entries and 75,919 words; research/buildbot-sheathing's 102 and 59,184.
- **The summary** in `project.json`/`projects.json`, printed as one `<p>`. cell-fidelity's was
  6,894 words in a single paragraph; 229 of 1,080 summaries ran past 150 words.
- **The README bullet** (the "lede"), printed in the header and in the "More in this topic" cards
  on six neighbouring pages. buildbot-sheathing's was 2,209 words, so its title block alone was
  9,400 px tall on a phone; 15 ledes are over 150 words.

At 390 px the 39 pages with a research log measured a median of 64,780 px and up to 427,675 px
(research/marine-hull). These are the portfolio's deepest projects, and a visitor saw the first
screen of a wall that never ended.

## What changed (`research/_homepage/build.py`, `project.html`, `topic.html`)

- `summary_paragraphs`: splits a summary where the text says a new part starts (`Milestone`,
  `Step`, `Stage`, `Phase`, `Session`, `Round`, `Part` at a sentence start, and `Limits:`), then
  splits any part still over 110 words at sentence ends. Breaks only go outside tags, outside
  open inline elements (`<code>`, `<em>`, `<sup>`...) and outside parentheses, and not after
  abbreviations (e.g., et al., vs., single capitals). A short summary with no marker stays one
  paragraph, so most pages are unchanged. Summaries with block HTML are left alone.
- `summary_html(fold=True)` on the project page: a summary over 700 words shows its first ~300
  and puts the rest in `<details class="summary-more">` ("Show the rest of the summary (56 more
  paragraphs, 4,815 words)"). Topic cards use the paragraphs but not the fold (they are already
  inside a `<details>`).
- `log_html`: the newest entry is open, and more while the open part stays under 500 words; the
  rest go inside one `<details class="log-older">` ("Show 101 earlier entries"), each entry a
  `<details>` whose `<summary>` is its `h3`. A log where folding would hide only one entry stays
  open.
- `short_lede`: on the project header (90 words) and on cards that link to a page (60 words: the
  index cards, featured cards and "More in"), a longer lede is cut at the last `; ` or sentence end
  that fits, outside tags and parentheses, and marked `…`. If the first clause alone is over twice
  the limit, nothing is cut. 68 headers and 159 cards are affected. The topic page's card still
  shows the whole lede, and the README bullet is untouched.
- Fixed a `<sup>…</sub>` typo in research/compute-shirking's summary in `projects.json`.

Nothing is removed from the HTML except the clipped lede copies: folded text is in the page, so
search engines and answer engines still read it, and the page works without JavaScript.

## Measured (Chromium, 390×844, research pages regenerated with the site chrome over a full local build of main at 65cf6e1d8)

All 39 pages with a `LOG.md` (full table: the run record's notes):

| | before | after |
|---|---|---|
| median page height | 64,780 px | 9,470 px |
| tallest page | 427,675 px (marine-hull) | 13,035 px (verifiable-training-mechanisms) |
| sum of all 39 | 4,611,003 px | 365,318 px (−92%) |

| page | before | after |
|---|---|---|
| marine-hull | 427,675 | 10,949 |
| heavy-hydraulics | 351,911 | 12,847 |
| cell-fidelity | 349,859 | 9,585 |
| verified-dse | 342,671 | 10,973 |
| buildbot-sheathing | 263,381 | 9,118 |
| sensing-selfcal | 247,311 | 9,616 |
| water-leaks | 119,216 | 9,291 |

buildbot-sheathing's "What it found" heading moved from 9,387 px to 837 px. accel-cascade (a
normal project, 240-word summary): one wall became three paragraphs ending with "Limits: …",
page +58 px. No page scrolls sideways (scrollWidth 390 on the ones screenshotted). Light and dark
mode checked on the open log.

Screenshots (390 px, 2x): `img/polish-2026-11-18-research-programme-pages-before-390.jpg` (the
header lede), `-after-390.jpg`, `-after-fold-390.jpg` (newest log entry, then the fold).

## The check

`platform/ci/test_research_summary_paragraphs.py` (18 tests, ~1 s): marker and sentence splits,
no break inside parentheses, code or after abbreviations, `<br>` runs, and that every real
summary in the repo keeps all its text and balanced tags per paragraph; the summary fold; the
lede clip; and the log fold (newest open, one wrapper, balanced `<details>`).

## Still weakest, and what I would do next

1. **The newest log entry is itself long** (600 to 1,500 words in the big programmes), so the
   pages are still 9,000 to 13,000 px on a phone. An entry's bullets start with a bold label
   ("**Why.**", "**What it means.**", "**Next.**"); showing "What it means" first would be the
   answer-first version, but needs a convention research runs follow.
2. **Ledes and summaries keep growing at the source.** The display now copes, but the README
   bullet is also what `research/README.md` shows on GitHub (2,209 words in one bullet). A
   research-side check (e.g. in `programme_check.py`) that a lede stays under ~80 words would stop
   it at the source; that is the research track's call.
3. **The opened fold's label still says "Show …".** A `[open]>summary` text swap needs either a
   second span or CSS content; small.
4. Research index cards with clipped ledes still carry the full lede in `data-search`, so search
   behaviour is unchanged; worth a glance if search results start to look odd.
