---
title: The days-in-a-row limit now crosses Monday
date: 2026-10-30
tags: [shift-roster-builder, scheduling]
description: "The roster builder started every week at zero days in a row; a new streak cell carries Thursday to Sunday into Monday so the limit holds."
---

The roster builder's days-in-a-row limit (six by default) counted from Monday
every week. Someone who worked Thursday to Sunday could be given Monday to
Wednesday as well, seven in a row, and the search saw nothing wrong. The
report `planStreaks` found such runs afterwards; this change stops the search
making them.

A staff line can now carry `streak: 4`, the days worked in a row up to last
Sunday. "Carry over last week" and `--weeks` write and refresh it, drop a stale
one for anyone who skipped Sunday, and add it to the new run when someone
worked all seven days. The search then counts Monday as day five.

The test is a single invented person and a hand-built week, not a real
payroll. The limit is a setting you choose, not a statement of any state's
law.
