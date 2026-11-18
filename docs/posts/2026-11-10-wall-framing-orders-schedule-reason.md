---
title: "Wall framing takeoff: order-by dates now say why the schedule was refused"
seo_title: "Construction lumber order-by dates CLI, schedule error messages"
date: 2026-11-10
tags: [wall-framing-takeoff, construction, cli]
description: "The order-by-date command used to say only that the schedule had problems. It now names the problem."
---

The [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/)
prints order-by dates for long-lead items (trusses, windows) from a plan's
schedule. Running `--orders` on a plan with no schedule, or with an activity
of negative length, printed one line: "The schedule has problems; fix them
first." It did not say which.

The schedule check already knew ("days must be zero or more", "the schedule
must be an object with `activities`"); the order-by code dropped it. It now
appends those reasons. Bad `--orders=DATE` values were already refused with
the date quoted, and still are. Tested on invented plans only; no builder's
real schedule has been run through it yet.
