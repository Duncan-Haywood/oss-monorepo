---
title: "When a Topic Filter Finds Nothing, Pass the Words On"
seo_title: "Topic Filter Empty State That Hands Off to Site Search"
date: 2026-11-12
tags: [polish, research, search, web-design]
description: "A research topic filter that matched nothing was a dead end. It now offers the same words to the search over all 1,074 projects, and that search reads ?q=."
---

Every [research topic page](/research/topics/twins/) now has a filter box. Type "lidar" on the
digital-twins page and 164 projects narrow to 9. Earlier today
[the topic pages got shorter](2026-11-12-research-topic-pages-clamped.md) and gained that filter.

But type a word the topic doesn't contain, say "yosys" on the twins page, and the filter said
"0 of 164" and stopped there. The reader had to guess that the project they wanted sat in another
topic, go back to the [research index](/research/) and type the word again.

Now an empty filter says so and offers a way on: "Nothing in this topic matches. Search all
research for it →". The link carries the words (`/research/?q=yosys`). The index search now fills
itself from `?q=`, so the reader lands on the 25 projects that do mention Yosys, in chip design
and EDA. The same `?q=` works on a topic page, so a filtered view can be shared as a link.

Checked in Chromium at 390 px and 1280 px wide: "lidar" leaves 9 of 164 and the note stays hidden.
"yosys" shows the note, and its link opens the index with 25 matching cards. `?q=regret` on the
twins page shows 20 of 164. There were no page errors. With JavaScript off, the filter stays hidden
as before and all 164 projects show.

Two lines of script and one paragraph of HTML. Small, but an empty result should never be where
a reader's path ends.
