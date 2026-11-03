---
title: "A free Mass intentions book that checks itself against canon law"
seo_title: "Free Mass intentions book for parishes, with canon 948-958 checks"
date: 2026-11-03
tags: [parish-office, parishes, religious-organizations, canon-law]
description: "The first tool for parish offices: record Mass intentions, book them into Masses, and flag the one-year limit, bination and short transfers."
---

The portfolio has a new direction: tools for Catholic parishes and other religious organisations, aimed at the standard problems a parish office has. The first one is the book every parish that takes Mass offerings must keep under canon 958: [the Mass intentions book](https://marisstella.app/parish-office/).

You record each intention with its offering, list the Masses, and press one button to book open intentions into free Masses. A requested date is honoured or left unbooked, never moved quietly, and the oldest intentions go first. The book then checks its own entries against canons 948 to 958, quoting each canon's text from vatican.va next to the finding:

- two offered intentions on one Mass (c. 948);
- a priest keeping offerings from two Masses the same day, except on Christmas (c. 951 §1), or taking one for a concelebrated second Mass (c. 951 §2);
- intentions near a year old, and those past a year that go to the ordinary (cc. 955 §2, 956), which the booking button then leaves alone;
- an intention passed to another priest for less than was received (c. 955 §1), or against the donor's wish (c. 954);
- more open intentions than a year of Masses can carry (c. 953).

It exports the register with the four columns canon 958 names, gives a year summary for the annual review, and has a command line (`node cli.mjs book.json`) that exits non-zero on a serious finding. Everything stays in the browser.

What it is not: it does not check collective intentions under the 1991 decree, foundation Masses or any diocese's own law, and the 21 engine tests run on made-up books. A real parish's book, anonymised, is the first thing it needs. The [roadmap](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/parish-office/ROADMAP.md) lists what comes next: a two-counter Sunday collection sheet, giving statements, sacramental registers, a safe-environment tracker and a minister scheduler.
