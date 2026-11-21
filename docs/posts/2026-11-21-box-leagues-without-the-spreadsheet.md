---
title: "Box leagues for squash and badminton clubs, without the spreadsheet"
seo_title: "Free box league manager for squash, badminton and tennis clubs"
date: 2026-11-21
tags: [league-schedule, box-league, squash, tools]
description: "A free page that splits a club ranking into even boxes, keeps each box's table, and works out who goes up and down, joiners, leavers and no-shows included."
---

Squash clubs have run box leagues for decades, and badminton, tennis and table tennis clubs copied them. The members are ranked, split into boxes of four or five, and everyone in a box plays everyone else over a month, booking their own courts. At the end of the month the top of each box goes up and the bottom goes down. It is a good format: matches stay close, and nobody needs a fixture secretary.

The arithmetic is where volunteers lose an evening. Seventeen members do not split into boxes of five. Two players finish level on the promotion line. One member never played a match and is sitting in box 2 holding it still. Three people join in March and one moves away. Clubs either keep a spreadsheet with hand-edited formulas or pay for a club platform that does this among a hundred other things.

**What we built.** A [box league manager](../../ventures/league-schedule-generator/box-league.html) in the free league schedule generator. Paste the ranking; it makes the boxes (the fewest boxes at or under your size, sizes within one, bigger boxes on top, never a box of two). Type each score on the page or paste the group chat's results ("Ana 3-1 Ben", "Ana w/o Ben"). Each box's table updates after every match: 3 for a win, 1 for playing, walkovers 3 and 0, all changeable. When the month ends, list who is leaving and joining and press close. The page lists every move with its reason and names any tie on a movement line and what decided it (head-to-head between two, then game difference, games won, the order the box started in).

**The no-show rule took two tries.** Most clubs drop a member who played nobody. The first version did, and then the step that keeps boxes even pulled them straight back up into the gap they had left. The browser click-through caught it. Now the next best player of the box below goes up to fill that place, and the no-show starts the next box at the bottom.

**How it was checked.** Twenty tests: box sizes for every club of 3 to 200 members and every target of 3 to 8; both tie-break paths; one and two up and down with upsets; no-shows on and above the relegation place; joiners and leavers; and twelve rounds of random results on a 37-member league moving two up and one down, checking after each round that everyone is in exactly one box and the boxes stay even. The [guide](../../ventures/league-schedule-generator/how-to-run-a-box-league.html) walks a 14-player round, and a test recomputes its tables and moves from the code, so the guide cannot drift from what the page does.

**Limits.** Everything stays on the organiser's phone; players get a read-only link, not their own score entry. The players are invented. No club has run a real month on it yet. If yours runs boxes, that is the test we want.
