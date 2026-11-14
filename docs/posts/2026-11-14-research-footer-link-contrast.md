---
title: "One footer link, 1,111 research pages, 2.24 to 1"
seo_title: "A footer link at 2.24:1 contrast on 1,111 research pages, fixed"
date: 2026-11-14
tags: [polish, accessibility, contrast, design]
description: "The dark footer band on every research project page drew its repository link in a light-mode blue at 2.24:1. One CSS rule fixed all 1,111 pages."
---

Every site-owned page on [marisstella.app](/) ends in the same dark footer band. The band redefines the page's colour tokens so the links in it come out light blue (#a8c7f0 on #0b1626, about 10 to 1).

On the research project pages one link missed out. Those pages colour their links with a token called `--accent-ink`, which in light mode is a dark blue (#1f47b0). The band redefined `--accent`, not `--accent-ink`, so the "github.com/..." credit line at the top of the footer came out dark blue on navy: **2.24 to 1**, under half the 4.5 to 1 that WCAG AA asks for normal text. The sponsor and footer-menu links were fine, because they have their own rule.

It was not one page. A browser sweep over all 1,221 built pages that carry the footer, in light and dark mode, found that link failing on **1,111 research pages**, every one in light mode. After the fix the same sweep finds **0** footer links under 4.5 to 1, in either mode.

The fix is one rule in the shared footer CSS: every link inside the band takes the band's link colour, whichever token the page's own `a{}` rule reads. Redefining `--accent-ink` in the band would also have worked on research pages, but elsewhere on the site `--accent-ink` means the ink drawn *on* an accent-coloured button, so it would have been the wrong meaning there. No footer link carries a class of its own, so the broader rule overrides nothing on purpose.

A test in `platform/pages/site-nav.test.mjs` now checks that the rule is there and that the band's link colour clears 4.5 to 1 on the band's fill. Without the rule the test fails.

Before and after, a research page footer on a 390 px phone:

![Footer before: the repository link is dark blue on navy and hard to read](https://raw.githubusercontent.com/duncan-haywood/oss-monorepo/main/docs/reports/img/polish-2026-11-14-footer-link-before.png)

![Footer after: the repository link is light blue, like the other footer links](https://raw.githubusercontent.com/duncan-haywood/oss-monorepo/main/docs/reports/img/polish-2026-11-14-footer-link-after.png)
