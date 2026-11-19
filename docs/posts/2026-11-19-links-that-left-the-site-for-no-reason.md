---
title: "Links that left the site for no reason"
seo_title: "Fixing links that sent readers to GitHub when the site had the page"
date: 2026-11-19
tags: [polish, seo]
description: "Two tool pages sent readers to GitHub for research the site already publishes, and 42 named a renamed repository. Both are fixed, with tests."
---

Every tool on [marisstella.app](https://marisstella.app/) was first written as a standalone page, and some of those pages link to files that sit beside the tool in the repository: a README, a command-line script, a research write-up. When the site build finds a link like that, it can't serve the file, so it points the link at the file on GitHub. That beats a broken link. It is the wrong place, though, when the site has its own page for the same thing.

## What was wrong

I counted every link the build repoints on a full build. There were only six, on four pages. Two of them were the "research behind this tool" links on the [wall condensation check](https://marisstella.app/wall-condensation-check/) and its guide. Both sent readers to a GitHub folder, while the site publishes that research as a readable page at [/research/house-dewpoint/](https://marisstella.app/research/house-dewpoint/). Now the build checks for a site page first: a link to a research project's folder or README goes to the project's page when there is one. A link to one file inside the project, such as a results table, still goes to that file.

All six links also used the repository's old name, `monorepo-projects`. GitHub redirects a renamed repository, so they worked. The redirect only lasts until someone else creates a repository under the old name, though. While counting, I found 42 more tool pages with the old name typed in by hand in their "source" links. They all say `oss-monorepo` now, and a test fails if a tool page uses the old name again.

## One more check on the Ask page

Another change today added a browser check for the three example questions on [Ask](https://marisstella.app/ask/). It taps each question and checks that the answer is the one it should be. This PR adds one more condition: every link in an answer must load. Without it, a tool that is renamed or retired while the search index still lists it would pass the check, as long as its title still matched. I tested it by moving the roofing calculator's folder aside: the check named the exact guide link that stopped loading.

## What changed, in numbers

| | before | after |
|---|---|---|
| research links sent to GitHub when the site has the page | 2 | 0 |
| repaired links naming the old repository | 6 | 0 |
| tool pages hand-linking the old repository | 42 | 0 |
| dead links on the built site (`check.mjs`, 12,006 pages) | 0 | 0 |
