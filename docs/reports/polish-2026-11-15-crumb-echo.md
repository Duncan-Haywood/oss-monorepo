---
kind: polish
topics: [design]
date: 2026-11-15
---
# Polish 2026-11-15: a research project's phone breadcrumb ends at its topic

Track: polish/0. Picked from `polish-2026-11-15-crumb-gives-way.md`, "Still weakest" item 3
(research project titles are still cut on a phone). Items 1 and the related-links item there were
landed by other runs (#16239, #16194). Searched open PRs for `polish` and `crumb`: only #16240
(blog topic pages), unrelated. The trail is the first line under the header on all 1,080 research
project pages.

## What was wrong

At 390 px a project page's trail read "Research › Proper … › What does a verifier's silence t…".
The topic (the one link a reader might want) was squeezed to its 4.5em floor, about 9 characters,
and the rest went to the project title, cut at about 33 characters. That title is the page's `h1`,
word for word, about 150 px further down. So the phone trail spent its width on a clipped copy of
the heading and hid the parent.

## What changed (`platform/pages/site-nav.mjs`)

- A crumb may carry `echo: true`: "the page's h1 repeats this". `renderSiteHeader` gives that last
  crumb and the separator before it `class="pfs-echo"`.
- Under 600 px, `.pfs-crumbs>.pfs-echo{display:none}`. Desktop is unchanged (identical 1,280 px
  screenshots before and after).
- `researchChromeTemplate()` marks the project header's `{{TITLE}}` crumb `echo`. Tool pages are not
  marked: a tool's crumb name and its `h1` often differ.
- Tests (`site-nav.test.mjs`): the markup and the phone-only rule; the research template marks the
  project title and not the topic page.

## Measured

Every research project page with a topic crumb (1,080), production build, Playwright, JS on.
"After" is the same build with the new `pf-site.css` and each project page's trail rewritten to the
new template's markup (exactly what `build.py` now emits), served from a copy.

| | 390 before | 390 after | 360 before | 360 after |
|---|---|---|---|---|
| topic shown in full | 0 | 1,080 | 0 | 1,080 |
| median characters of the topic visible | 9 | 27 (all) | 9 | 27 (all) |
| title in the trail (cut) | 1,080 (median 33 chars shown) | 0 | 1,080 (28) | 0 |
| pages whose `h1` is the title | 1,079 + 1 with `<sub>` markup | | | |
| trail row height | 27 px | 27 px | 27 px | 27 px |
| page wider than the screen | 0 | 0 | 0 | 0 |

The longest topic name is 38 characters and fits at 360 px.
Screenshots: `docs/reports/img/polish-crumb-echo-{before,after}-{abstention-scoring,accel-codesign}-390.png`.

## Still weakest, and what I would do next

1. **Tool pages**: the same idea could apply where a tool's `h1` equals its crumb name. Check how
   many of the 1,365 do (the build can compare `toolName` with the first `h1` and pass `echo`), then
   decide whether "Tools › category" alone reads better than the cut name there.
2. **The eyebrow above a project's h1 repeats the topic** ("PROPER SCORING & ELICITATION", not a
   link) right under a trail that now shows it. Making the eyebrow the topic link, or dropping it on
   a phone, would save a line above the fold (h1 top is 236 px at 390).
3. Carried over: no-JS gutter on 49 tool headers; desktop band vs host column alignment;
   `cardName` vs `toolName`; Tools and projects is about half the blog.
