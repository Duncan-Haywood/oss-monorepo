---
title: "A call-out answer a script can read: shift-roster-builder --cover --json"
seo_title: "Shift call-out cover finder as JSON for scripts and bots"
date: 2026-11-07
tags: [shift-roster-builder, scheduling, cli]
description: "The call-out cover finder now prints JSON, so a chat bot or cron job can read who can take a shift and which hand-over chains work."
---

When someone calls out, `node cli.mjs --cover "Tue 17:00" staff.txt shifts.txt` already says who can take the shift outright (cheapest first, overtime flagged) or, failing that, the shortest chains of hand-overs that keep every rule. That answer was prose only. Adding `--json` now prints the same answer as data: the shift and its current owner, the people who can take it outright with the pay change and hours after, the reason each other person is blocked, and each chain step by step (who takes which shift from whom).

It is meant for a Slack or SMS bot, or a cron job that posts the options to a manager. Nothing leaves the machine, and the search is the same seeded solver as before. A new test covers a chain case and an outright case. This is a small slice: no live team has used it.
