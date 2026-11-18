---
title: "Checking a shift swap from the terminal"
seo_title: "Check a shift swap against rest, hours and availability rules"
date: 2026-11-05
tags: [scheduling, shift-roster-builder, cli]
description: "The free shift-roster-builder CLI can now answer 'can Ana and Ben swap Tuesday close for Saturday open?' against your own rules, with the pay change."
---

Staff ask to swap shifts all the time, and the manager's real question is whether the swap breaks anything: a short rest between a close and an open, a weekly hour cap, a day someone said they cannot work.

`shift-roster-builder` already had that check on its web page. As of today the command line has it too:

```
node cli.mjs --swap "Tue 17:00,Sat 09:00" staff.txt shifts.txt
```

It finds the two shifts, swaps their owners, and reports either that both weeks stay inside every hard rule with the payroll change of the pair (overtime included), or the rule that stops each person. Everyone else keeps their shifts. Nothing leaves your machine.

This is a planning aid, not legal advice, and it is tested on invented weeks only. A real team's rules and swap requests would be the useful next test.
