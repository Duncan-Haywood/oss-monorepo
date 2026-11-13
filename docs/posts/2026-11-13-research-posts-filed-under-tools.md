---
title: "110 research posts were filed under Tools on the blog"
seo_title: "Why 110 research write-ups were filed under the wrong topic"
date: 2026-11-13
topic: infrastructure
tags: [polish, blog, information-architecture, seo]
description: "The blog sorted posts by tag, and research posts named their project rather than adding 'research'. 110 landed in Tools and projects. Now the project decides."
---

The [blog](/writing/) has six topic filters. On 13 November the "Research findings" chip
said 745 and "Tools and projects" said 2,970. The first two cards on the page told you
something was off: a pre-registered battery-model test and a construction-robot sheathing
result, both under the blue "Tools and projects" pill.

**Why.** A post's topic comes from its tags, first rule wins. A post was a research finding
only if one of its tags was literally `research`. Research write-ups usually tag their
project instead (`marine-hull`, `aerolog-scaling`, `cell-fidelity`), and anything that
matched no rule fell through to "Tools and projects". 110 posts did: 17 each from
aerolog-scaling and marine-hull, 12 from cell-fidelity, 10 from verified-dse, 9 each from
buildbot-sheathing and heavy-hydraulics, and the rest from 13 other projects.

**The fix.** The build now reads the folder names under `research/` and `ventures/`. A tag
that names a research project files the post under Research findings; a tag that names a
venture files it under Tools, ahead of the generic "agents" or "CI" tags. No post had to be
retagged. 1,077 research slugs and 1,352 venture slugs share no name, so the rule is never
ambiguous. Four posts moved the other way: a CLI alert setting for changepoint-detector and
two posts about the continue-on-error GitHub Action are tools rather than CI plumbing, and
the sales-agent call-prep brief is a tool rather than a post about agents. Two process posts
about the Hearth & Horizon README would have moved too; they now say `topic: agents` in
their front matter, which is the override the blog already had.

Counts over the 4,042 posts that existed before this one:

| topic | before | after |
|---|---|---|
| Research findings | 745 | 855 |
| Tools and projects | 2,970 | 2,871 |
| Building with AI agents | 165 | 157 |
| Hosting and infrastructure | 40 | 37 |

The topic also goes into the Atom feed as a `<category>` and into each post's "More in ..."
link, so a reader who follows research from one post now reaches the other research.

**A smaller fix on the same page.** The search box builds result cards in the browser, and
they did not match the list: no topic pill, and the date as `2026-11-10` instead of
"10 November 2026". The server-rendered cards had their own oddity: the date and the reading
time were each a grey pill, so on a phone "3 min read" wrapped onto a line of its own. Both
now show the topic pill and one muted line, "13 November 2026 · 3 min read". On a post's
own header, "Source" no longer wraps alone onto a new line after a dangling dot.

What this does not fix: about 580 posts in "Tools and projects" name no project at all
(tagged `open-source`, `testing`, `seo`, `redteam` and so on). Some of them are about the site
or the agent fleet rather than a tool. Sorting those is an editorial call, post by post.
