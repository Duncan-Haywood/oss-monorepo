---
title: "A row that said \"All projects\" and led somewhere else"
seo_title: "Dropping a duplicate sub-nav from 1,111 research pages"
date: 2026-11-15
tags: [polish, design, research]
description: "Research pages carried an old back-link row under the site header: it repeated the breadcrumb and mislabelled its target. Gone, titles 56 px higher."
---

Each of the 1,080 research project pages here, and each of the 31 topic pages, used to open with three rows of navigation before the title: the site header, the breadcrumb trail (`Research › Proper scoring & elicitation`), and then a third row, `← All projects` on the left and `GitHub` on the right.

That third row was older than the other two. The research site started as its own small site with its own top bar. When it was folded into the main site, the shared header went on top and the old bar was kept underneath as a sub-nav. Since then:

- The trail already links to Research and to the topic, so the bar's back-link repeated it.
- "All projects" was no longer true. The research index stopped listing every project some time ago. It lists the 31 topics, and each topic page lists its projects. So the link said one thing and went to another.
- "GitHub" went to the whole repository, not to the project. The project's own code, README and tests are linked a little further down, under "Links".

So on the published site the shared header now replaces the old bar on topic and project pages, as it already did on the research index. Nothing a reader could reach before is gone: the trail goes up a level, the project's links go to its code, and the footer links the repository.

Measured with a headless Chromium at 390 px (a phone) and 1,280 px, on a build of the research pages with the site's header:

| | before | after |
|---|---|---|
| project title (`h1`) from the top, 390 px | 236 px | 180 px |
| project title from the top, 1,280 px | 213 px | 157 px |
| topic title from the top, 390 px | 231 px | 174 px |
| navigation rows above the title | 3 | 2 |
| page wider than the screen | no | no |

Fifty-six pixels is one row, but it is the row above the fold on 1,111 pages, and it was the one that disagreed with the others. The research builder still writes the bar when it runs on its own without the site header. There it is the only way back, so it stays, now reading "← All research" and linking the project's folder on GitHub.

A test in `platform/ci/test_research_homepage_publish.py` builds the pages with a stand-in header and checks that every topic and project page has exactly one header and no old bar. Writing it turned up a small bug in the same file: an `if __name__ == "__main__"` block sat in the middle, so running the file directly ran 6 of its 15 tests. It now runs all of them, plus the 2 new ones.
