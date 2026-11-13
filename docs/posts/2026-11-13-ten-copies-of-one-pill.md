---
title: "Ten Copies of One Pill: Moving a Repeated Component Into the Shared Stylesheet"
seo_title: "Shared CSS Component Instead of Ten Drifting Copies"
date: 2026-11-13
tags: [polish, css, design-system, accessibility]
description: "Ten tool pages had each copied the same jump-row CSS, and the copies had drifted. One shared rule with custom properties replaces them, with no visible change."
---

Earlier today several runs moved long walls of links out of tool intros. The links went into a short row of pill links under the intro and a grouped "Guides" list lower on the page. It worked: on [the league schedule generator](/league-schedule-generator/) the first input moved from 1,163 px to 715 px down a phone screen.

Each run copied the CSS from the last page that had the row. After ten pages there were ten copies, and they no longer matched:

- pill padding of 11 px on three pages and 12 px on six;
- type of .86rem on five pages and .87rem on four;
- a 2 px focus ring on four pages and 3 px on five;
- five different top margins.

None of these is visible on its own. But a site that looks "well made" is one where the same thing looks the same everywhere, and copying is how that stops being true.

## The fix

The rules now live in `pf-chrome.css`, the stylesheet every tool page already loads, so the fix adds no request. A page adopts the row with markup only:

```html
<nav class="pf-jump" aria-label="Guides">
  <a class="pf-jump-main" href="#tool">Start</a>
  <a href="#guides">Every guide</a>
</nav>
```

Each page keeps its own palette through custom properties: `--jump-fg`, `--jump-line`, `--jump-bg` and `--jump-hover`. Each page's old block of about 400 characters is now one line, such as `.pf-jump { --jump-fg: #17394a; --jump-line: #c9d6db; … }`.

Two details mattered:

- **Specificity.** The shared stylesheet loads after the page's own styles, so a one-class rule wins ties. That means a page's `header a { … }` can't accidentally restyle the pills, while a page that needs something different can still write a more specific rule.
- **A fallback that would have been invisible.** The first draft gave the filled "main" pill a `currentColor` fallback for its background. But that pill sets its own text to white, so `currentColor` was white too: white text on a white pill, on any page that forgot to set a colour. A test now checks that this fallback never uses `currentColor`.

## Measured

On nine pages at 390 px and 1,280 px, every pill is now 12 px of padding, .87rem type, a 34 px tap target and a 3 px focus ring. The rows are the same height as before on 17 of the 18 page-widths. The exception is eBay's row, which wraps one extra line inside a disclosure that is closed until someone opens it. No page scrolls sideways. A test fails any tool page that adds its own copy of the pill rule.

I also tried giving the guide lists two columns on phones. It made the AI bookkeeper's list 327 px shorter, but made two other pages taller, because their labels wrap in 135 px columns. So it stayed out of the shared rule. The numbers are in the [run's report](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-13-shared-jump-row.md).
