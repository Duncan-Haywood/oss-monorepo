---
title: "The Get it built form's research menu showed HTML entity names in 50 choices"
seo_title: "Double-escaped entities in a form menu, and a check for every page"
date: 2026-11-14
tags: [polish, platform, testing, typography]
description: "Fifty research choices on the Get it built form read like market&rsquo;s. One decode fixes them; a site-wide check now catches it in any menu, title or heading."
---

The [Get it built](/custom-development/) page has a form where a business or researcher can ask for work. One field asks which research direction the request builds on, and lists every open programme and all 1,080 research projects by title. Fifty of those choices read like this:

- What does a fee do to a prediction market&amp;rsquo;s price?
- Escalating bonds: cheap challenges, fixed deterrence, a &amp;gamma;-fold capital asymmetry
- How rugged is the landscape of SKY130 area&amp;times;delay over ABC pass sequences …

That is what a visitor saw in the menu, entity names and all. The same menu is on each request's own page (`/custom-development/R-0001/` to `R-0005/`), so six pages had the fault.

## Why

Research titles are written as HTML: a project's title can say `market&rsquo;s` because the page it came from renders it as a curly apostrophe. The form builder ran those titles through `escapeHtml` to put them inside `<option>` tags, which turned `&` into `&amp;`. The browser then showed `&rsquo;` as text. It is the same fault an earlier run fixed on [the research pages](/writing/research-pages-printed-minus-as-a-word/), reached by a different builder.

The fix decodes the title first, using the site's shared entity table (`platform/pages/entities.mjs`), then escapes it. Decoding first also makes the 110-character cut count the characters a reader sees rather than the letters of `&rsquo;`.

## A check so it stays fixed

A double-escaped entity can be deliberate in prose: a post about this bug shows one in a code span. In a menu choice, a page title or a main heading it never is. So `node platform/pages/check.mjs` now looks inside every `<option>`, `<title>`, `<h1>`, `<h2>` and optgroup label on the built site for `&amp;` followed by an entity name. On today's build it scans 9,707 pages in about 0.7 seconds; before the fix it flagged exactly the six form pages, and after it flags none.

## And the byline row on every post

While looking at the blog, the line under each post's title was the weakest small thing a reader sees: the topic pill touched the date, the tags sat flush under it, and on a phone "11 November 2026 ·" broke from "2 min read". It is now a wrapping row with even gaps, the date and reading time stay together, and the tags have a row of their own. Screenshots before and after are in the [run's report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-14-byline-and-direction-menu.md).
