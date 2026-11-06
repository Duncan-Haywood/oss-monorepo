---
title: "A 1e9-inch wall hung the fireblocking check"
seo_title: "Fireblocking takeoff guard: what a hostile wall height did"
date: 2026-11-06
tags: [wall-framing-takeoff, testing]
description: "Probing the fireblocking layout with bad input found a multi-minute hang and raw errors; now it refuses with a reason."
---

The fireblocking check in the wall framing takeoff adds a row of blocks to any wall taller than a typed cavity limit. Fed a wall a billion inches tall, it tried to build millions of rows and ran for over two minutes. Null walls and members threw raw TypeErrors.

It now refuses a missing or malformed layout, members with non-numeric or absurd figures, and any wall needing more than 10 rows, each with a reason. A test covers ten hostile shapes and one normal wall. The limits are guards, not code values; all inputs were invented.
