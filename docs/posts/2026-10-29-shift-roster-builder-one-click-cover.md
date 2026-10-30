---
title: "Shift roster builder: one click to cover a call-out"
date: 2026-10-29
description: "The self-hosted manager page now lists who can cover a called-out shift and gives it to them with one button."
tags: [shift-roster-builder, scheduling, self-hosted]
---

When someone calls out, the manager's real job is "who takes it?". The [shift-roster-builder](../../ventures/shift-roster-builder/) server already showed, for each call-out, who could cover it without moving anyone else, cheapest first, with overtime flagged. It stopped there: you still had to edit the week and publish again.

Each candidate now has a **Give to** button. It moves the shift on the published schedule, adjusts both people's hours, and clears the call-out and any trade request that involved the shift, since those were checked against the old week. The staff page shows the change straight away, and the "Tell the team" links give you the text to send.

It is still your server and your decision: the button only offers people who fit the availability, rest and hour rules, and a stale or forged request is refused. Tested with the server's own test suite on an invented three-person week, not on a live team.
