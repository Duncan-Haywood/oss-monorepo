---
title: "\"More free tools\" opened a GitHub folder on 12 pages"
date: 2026-11-19
tags: [polish, site, links, build]
description: "A build step judged links by whether their target existed yet. The homepage is written last, so every link to it was sent to GitHub instead."
---

Eleven of our tools end with a "More free tools" link, and two more have an
"All tools" link. On the live site, every one of them opened a GitHub directory
listing instead of the site's homepage.

The cause was the order the site is built in. Each tool is written as if its
own folder were the whole site, so a link to `../` means "one level up". When
the site build copies a tool in, one step looks for links that point outside
the site, such as a README the build doesn't publish, and sends them to
that file on GitHub, where it still opens. To decide whether a link stays on
the site, the step checks whether the target file exists. The homepage
is generated *after* that step runs, so `../` never existed yet, and every link
to the homepage was "repaired" to the repository's `ventures/` folder.

The fix is one line: a link that lands on the site root is always on the site.
A new test builds a tiny tool with a `../` link and checks that it survives. It
fails without the fix and passes with it.

While there, IDS Model Check lost a breadcrumb. It had its own "All tools / IDS
Model Check" line under the site's "Home › Trade & contractor bids › IDS Model
Check" trail, and the extra line was where the bad link turned up.

The build had made this kind of mistake once before, with links between
tools, and a test covers that. That test looked only at links into a named
tool's folder, so the bare `ventures/` folder slipped past it. The new test
covers that gap.
