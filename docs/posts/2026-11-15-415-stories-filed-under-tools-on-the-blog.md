---
title: "The blog filed 415 bedtime stories under Tools"
seo_title: "Giving AI-written fiction its own Stories topic on the blog"
date: 2026-11-15
tags: [polish, seo, blog, platform]
description: "Saints' bedtime stories and science fiction showed a 'Tools and projects' badge on the blog. A Stories topic now holds 415 of them."
---

Open the blog on a phone and the first thing under the search box is a row of topic chips. Until today one of them, **Tools and projects**, held 3,253 of the 4,654 posts, and a fair share of those were not about tools at all. A Little Lamps bedtime story about Saint Zita and the bread in the oven showed a "Tools and projects" badge above its first line. So did Hearth & Horizon science fiction and the Saints by Candlelight episodes.

The cause was a sensible rule applied a step too far. The blog gives each post one topic from its tags, and a tag that names a folder under `ventures/` means "this post is about that product". The story shelves are built and published as ventures, so a post tagged `hearth-and-horizon` or `saints-by-candlelight` counted as a product post. Stories tagged only `fiction` matched no rule and fell through to the same bucket, since anything unmatched lands in Tools.

The fix adds a **Stories** topic. A post goes there when it carries a fiction tag (`fiction`, `science-fiction`, `short-story`, `bedtime-story`) or a shelf's name (Hearth & Horizon, For Other Minds, Little Lamps, Saints by Candlelight). The exception is a post about how a shelf is run, such as its to-do list, its audio cap or its story queue. Those carry a `process` or hosting tag and stay where they were.

| topic | before | after |
|---|---|---|
| Tools and projects | 3,253 | 2,846 |
| Building with AI agents | 199 | 191 |
| Stories | (none) | 415 |
| Research, Quality, Start here, Hosting | unchanged | unchanged |

The eight from "Building with AI agents" are For Other Minds stories, fiction written for AI agents to read. They are about agents, but they are stories, and now they sit with the other stories.

What changes for a reader:

- the topic chip under a story's title now reads **Stories**, and it links to the blog filtered to fiction;
- the "related posts" under a story come from other stories first, not from wall-framing or bookkeeping posts;
- `articleSection` in each story's structured data says `Stories`;
- the podcast gains a `stories` feed. Three episodes that read Hearth & Horizon stories (the asteroid odds, the ton of coal, the falling water level) move from the podcast's "Tools and projects" feed to it. The all-episodes feed is unchanged.

Before and after, on a phone:

![A Little Lamps bedtime story's header before: the topic badge read Tools and projects](../reports/img/polish-2026-11-15-story-post-before.png)

![The same header after: the badge reads Stories](../reports/img/polish-2026-11-15-story-post-after.png)

![The blog filtered to the new Stories topic](../reports/img/polish-2026-11-15-blog-stories-after.png)

This is the blog's half of a fix the story pages got on 11 November, when [436 story pages stopped calling themselves tools](https://marisstella.app/writing/436-stories-filed-under-tools/) in their header and breadcrumb. The same cause, a fiction shelf treated as a product because it is built like one, reached a second place. Counted on a full local build; tests in `platform/pages/writing.test.mjs` pin the new rule and its exceptions.
