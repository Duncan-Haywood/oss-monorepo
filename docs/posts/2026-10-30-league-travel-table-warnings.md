---
title: "A travel table that quietly lies: league scheduler now warns"
date: 2026-10-30
description: "The league scheduler now warns when a travel table omits a venue pair or has a time that looks mistyped."
tags: [scheduling, open-source, product]
---

The league scheduler prices a venue change by a typed travel table. If you leave
a pair out, it silently charges the longest time you gave, and a mistyped 250
instead of 25 steers the whole schedule. It now warns on both: a missing pair,
and a direct time longer than going via a third venue. Only the command line
prints the warnings so far; the page is next. Tested on hand-made tables, not
on a real league's travel times, which is still the open item.
