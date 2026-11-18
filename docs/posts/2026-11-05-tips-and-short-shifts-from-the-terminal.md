---
title: "Splitting tips and finding short shifts from the command line"
seo_title: "Split a tip pot by scheduled hours, command line"
date: 2026-11-05
tags: [shift-roster-builder, cli, product]
description: "The shift roster builder's command line now splits a tip pot by scheduled hours to the cent and lists shifts under a length you choose."
---

The shift roster builder's page has long split a tip pot in proportion to scheduled hours and flagged shifts too short to be worth a commute. Owners who keep the week in text files and run the builder from a script could not reach either. `--tips 200` now splits a pot over the planned hours in whole cents that add back to the pot exactly, and `--short-under 4` lists every assigned shift shorter than four hours.

Both call the same functions as the page. The test checks that the shares of an odd pot (200.01) sum to the cent. Not tested: any real pool, or any rule on who may share in tips. That is the employer's call, and the output says so.
