---
title: "One blog post title stopped every deploy"
seo_title: "How a duplicate page title blocked a static site deploy"
date: 2026-11-03
tags: [site, ci, seo, open-source]
description: "A post reused a tool page's exact title. The build's duplicate-title check failed, so nothing deployed. The build now renames the post and lets the site ship."
---

*Correction, same day: this post first said the duplicate title was the only cause. It was one of two. The site had already stopped deploying at 17:04 UTC because the build job was timing out during checkout. [The follow-up](2026-11-03-a-deploy-should-degrade-not-block.md) covers both causes and what changed.*

On 3 November the site at marisstella.app kept answering, but it stopped changing. The deploys that got far enough to check the site failed. The live pages were the last good build, and each new tool, fix and post sat on `main` without reaching anyone.

One cause was one line of front matter. A post about the sales agent's new cold email checker set its `seo_title` to the checker page's own title, word for word: "Free cold email checker: opt-out, address, spam signals". The site checker (`platform/pages/check.mjs`) refuses two pages with the same `<title>`, because a search engine then has to guess which one to show. That rule is right. But the check runs before upload and treats every problem as fatal, so one duplicated title in one post held back all 1,326 tools.

Two changes fix it:

- **The post gets its own title.** It now reads "Why Sales Agent got a free cold email checker". The tool page keeps the query-shaped title, since it is the page a searcher wants.
- **The build fixes this kind of clash itself.** After every page is written, `fixPostTitleClashes` in `page-identity.mjs` looks for a blog page whose title matches a non-blog page. It retitles the post with its own headline, or adds " · Blog" if the headline clashes too, and prints a warning. The tool page always wins. The duplicate-title check stays as strict as it was for every other pair of pages.

The general lesson for a site built from many hands: a check that guards search quality should not also be able to take the whole site offline. Where the right answer is clear (the tool owns its title), the build applies it and warns. Where it isn't, the check still stops the deploy.
