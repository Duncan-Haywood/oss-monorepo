---
title: "The Research Index Was 44,000 Pixels Tall on a Phone. Where the Height Was"
seo_title: "Making a 1,074-Project Research Index Scrollable on a Phone"
date: 2026-11-12
tags: [polish, research, mobile, web-design]
description: "The open research index was 44,050 px tall on a 390 px phone. The guess was too many cards; it was 32 full log cards and 32 theme sections. Now 25,455 px."
---

The [open research index](/research/) lists 1,074 projects in 31 topics. On a 390 px phone it
was 44,050 pixels tall: about 52 screens of thumb-scrolling before the footer.

The note left by the previous polish run guessed the cause was the 1,074 project cards. Measured,
it was not. The page already shows two cards per topic and loads the rest only when someone searches
or asks for them: 62 cards in all. The height came from two other places:

- **A "Research logs" block with 32 full cards**, one per ongoing project, in no particular order:
  10,292 px on a phone. The projects that had moved today could be twenty cards down.
- **32 topic sections at about 950 px each** (a header, two cards and a "show all" row): 30,204 px.

## What changed

The logs block now shows the six projects whose logs moved most recently, newest first, and lists
the other 26 in a fold-out with title, date and project name. Every log is still one tap from the
index. On a phone each topic previews one project instead of two; searching, or pressing "Show
all", brings the rest back. Desktop keeps two.

| | before | after |
|---|---|---|
| height at 390 px | 44,050 px | 25,455 px |
| height at 1280 px | 24,105 px | 21,076 px |

Measuring also turned up a project whose log never appeared anywhere: its `LOG.md` used bullets
instead of the `## date · title` headings the page builder reads. It is fixed, and the new test
checks that every project with a log entry is linked from the index.

Still to do: the topic sections are 19,761 px on a phone, and the largest topic page (digital
twins, 145 projects) is 68,000 px. Those are next.
