---
title: "When two teams are still level: recursive head-to-head in league tables"
seo_title: "Recursive head-to-head tie-breaks in league tables"
date: 2026-11-02
tags: [league-schedule-generator, standings, testing]
description: Level teams are now split by a fresh mini-table among only those still tied; 321 of 200,000 random leagues ranked differently.
---

Our league schedule generator ranked teams level on points by a mini-table of the games among them. If that left two teams still level, it fell straight to overall goal difference. Football bodies such as UEFA and FIFA instead apply the mini-table again to just the teams still tied.

We changed `standings` to do that, then compared old and new over 200,000 random six-team leagues: 321 tables ranked differently. The smallest is now a test. Made-up results only; no real league's table has been checked yet.
