---
title: "The site's footer links are now a menu"
seo_title: "Maris Stella Labs: secondary pages moved into a header menu"
date: 2026-11-04
tags: [site, navigation, accessibility]
description: "Twenty-three links that sat at the bottom of every page now sit in a grouped Menu in the header, available on every site page."
---

Every site-owned page on marisstella.app used to end in a grid of 23 links: the category index, guides, comparisons, the work queue, the engineering status page, the daily brief, four machine-readable files and more. To reach any of them you scrolled past the whole page. Pages without that footer, such as /deploy/ and /dev/, had no way to reach them at all.

They now sit in a **Menu** button in the shared header, in five groups:

- **Tools:** all tools by category, guides, comparisons, the lab, deploying your own copy
- **Read and listen:** research, blog, podcast, stories, updates and roadmap, changelog
- **Work with us:** custom development requests, reporting a problem, asking a question, about and press kit
- **Behind the scenes:** the work queue, engineering status, the development dashboard, the daily brief, the source on GitHub
- **For machines:** the JSON catalogue, llms.txt, the sitemap and both feeds

It is a plain `<details>` element, so it opens from the keyboard and still works when scripts are blocked. A few lines of script add closing on Escape (focus goes back to the button) and on a click outside the menu. On a phone it sits beside Search on the first row and opens as a full-width two-column panel.

The footer keeps the disclaimer, the optional support line and one short line: report a problem, request custom development, about, and the source.

Tool pages are unchanged. Their own footer already lists related tools, and two tools have scripts that select the first `<details>` on the page, so the menu stays off those pages for now. The code is `renderSiteMenu` in `platform/pages/site-nav.mjs`.
