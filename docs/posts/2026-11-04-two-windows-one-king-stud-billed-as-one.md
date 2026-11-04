---
title: "Two windows, one king stud, billed as one"
date: 2026-11-04
description: "A bug in the wall-framing budget: labour for setting windows counted king studs divided by two, so windows that share a king were undercounted. Fixed by counting header spans."
tags: [wall-framing-takeoff, construction, budget]
---

# Two windows, one king stud, billed as one

The framing takeoff's budget prices "door and window setting" per framed
opening. It found the count by dividing king studs by two, because each
opening normally has two.

That breaks when two openings sit close together and share a king stud. Two
windows 4-1/2 inches apart are framed with three kings, so the budget saw
1.5, rounded down to one, and priced one window.

The budget now counts distinct header spans in each wall, one per opening, and
only falls back to kings divided by two when no header is placed. A test frames
exactly that pair (three kings, two openings, a 100 dollar typed rate) and
expects 200 dollars where the old rule gave 100. The sample house still counts
12 openings.

The rate is whatever you type; no contractor's real rate is built in, and the
test plan is invented.
