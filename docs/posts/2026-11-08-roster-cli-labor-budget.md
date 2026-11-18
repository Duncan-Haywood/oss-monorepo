---
title: "Over the labor budget? The roster CLI now says which shifts to drop"
date: 2026-11-08
tags: [scheduling, shift-roster-builder]
description: "shift-roster-builder's command line gets --budget: payroll against a weekly dollar budget, and the drops that close the gap."
---

The browser page already told an owner how far payroll sat over a weekly budget. The command line, which owners run from a Sunday cron, could not. `node cli.mjs --budget 2400 staff.txt shifts.txt` now prints payroll against the budget and, when it is over, lists the drops that close the gap, biggest saving first.

Each row says whether the shift stays covered by another person or leaves the shift empty, and whether the drop takes someone under their minimum hours. Rows come from `trimOptions`, the same function the page uses, so overtime and burden are priced across the person's week. Savings are per drop and do not add exactly, so the report says to re-run to confirm.

Limits: the list is by saving, not by how busy the hour is, and the owner decides what to cut. Tested on hand-built weeks and the sample week, not on a real payroll.
