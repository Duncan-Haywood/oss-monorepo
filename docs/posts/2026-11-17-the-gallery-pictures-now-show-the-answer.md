---
title: "The home page gallery now shows each tool's answer, not a shrunk page"
date: 2026-11-17
tags: [site, design, polish, performance]
seo_title: "Home page tool gallery shows close crops of each answer"
description: "The See it working gallery shrank whole tool pages into 280 px cards. It now shows a close crop of each tool's answer: text 1.8x larger, 40% fewer bytes."
---

Halfway down the home page, under "See it working", is a row of nine cards. Each one is a
real screenshot of a tool on this site with its worked example loaded. Yesterday the three tools
in the hero got close crops, so their drawings could be read. The gallery kept the old pictures:
a whole 1,280 px page squeezed into a card about 280 px wide, with text about 3 px tall.

Now every card shows the part of the tool that answers the question, laid out at 720 px:

- Band Tour Profit Planner: the tour's net, the weakest date, and which shows to keep or drop;
- League Schedule Generator: the round-by-round table of dates, courts and matches;
- Event Seating Chart Optimizer: the tables with every guest seated;
- Invoice Maker: receivables, with what is outstanding and overdue;
- Incident Postmortem Timeline: detect, acknowledge, mitigate and resolve times;
- Greenhouse Bench Planner: bench space used week by week.

The text is about 1.8 times larger than before, and the nine pictures are 40% smaller
(166 KB, down from 278 KB), because a crop has less to encode than a whole page.

Two things in the capture script were fixed on the way. A crop used to be cut from a full-page
screenshot, which lays the page out again at its whole height; on the league schedule that moved
the table about 20 px, and a line of the note above it showed at the top. The crop is now taken
from the viewport after scrolling, and measured again first. And a test now fails if a tool in the
gallery has no crop, so the next tool added to the showcase gets one too.
