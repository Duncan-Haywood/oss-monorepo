---
title: "Wall braces now have controls on the framing page"
seo_title: "Wall brace count controls on the wall framing takeoff page"
date: 2026-11-06
tags: [wall-framing-takeoff, fasteners, construction]
description: "The open-source wall framing takeoff page gained a tick, a spacing field and a price field for diagonal wall braces."
---

Diagonal wall braces were only reachable from the command line and plan files. The page's nailing card now has three controls: a select to turn braces on, a spacing in inches (blank means 300) and a price per brace.

The count is the same typed rule as before: one brace per spacing of wall length on walls at least 48 in long, each at 45 degrees. Which walls are braced wall lines, and the method, remain the engineer's call. A Chromium click test (`eval-browser-click.mjs`) turns braces on, types a price and checks the card text; plan files save and reload the three fields.
