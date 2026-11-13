---
title: "Four more tools that opened with a wall of links"
seo_title: "League schedule, shift roster, residency and 3PL tools: the form before the links"
date: 2026-11-13
tags: [design, mobile, seo, open-source]
description: "The league schedule generator's intro named 28 guides in one paragraph. It and three other tools now open with a short line, four buttons and the form, and keep every guide in a grouped list lower down."
---

The [league schedule generator](/league-schedule-generator/) has 29 guide pages: how byes work
with an odd number of teams, Swiss pairings, a pickleball league on two courts, and so on. Until
today, 28 of them were named in a single paragraph under the heading, so on a 390-pixel-wide phone
the box where you paste your team names started 1,163 pixels down. That is past the bottom of the
first screen, behind a paragraph nobody reads in full.

It now opens with one line on who it is for, four buttons ("How a round robin works", "Rounds for
3 to 16 teams", "Several divisions", "All guides (29)"), and then the form. The guides moved to a
card above the questions, in four groups: round robins and leagues, other formats, example
schedules by sport, and look-up tables. The paste box now starts at 715 pixels, inside the first
screen.

The same change went to three more tools that a site check still allowed to carry an oversized
intro:

| tool, 390 px phone | first input before | after |
|---|---|---|
| [league schedule generator](/league-schedule-generator/) | 1,163 px | 715 px |
| [shift roster builder](/shift-roster-builder/) | 1,278 px | 832 px |
| [state residency day counter](/state-residency-day-counter/) | 824 px | 757 px |
| [3PL quote normalizer](/3pl-quote-normalizer/) | 603 px | 491 px |

Measured on the tool pages as written, in Chromium with reduced motion and no third-party
requests; the published pages add the site band above, the same height before and after.

Two things were kept on purpose. Every link that was in the paragraph is still on the page, so
nothing lost its way in from the tool. And the safety lines stayed at the top: the residency
counter still says first that a day count cannot settle domicile, and the shift roster builder
still says it does not know your local scheduling-notice or minor-labor laws.

One page gained a link. The league generator's
[season pack page](/league-schedule-generator/season-pack-for-league-organisers.html) was in the
sitemap but not linked from the tool. It is listed now, labelled as what it is: a planned paid
extra, not on sale, with the schedule itself free.

The check that found these, `platform/pages/intro-links.test.mjs`, had four pages on an
allowance list. The list is empty now, so any tool whose intro paragraph grows past eight links
fails the site's tests.
