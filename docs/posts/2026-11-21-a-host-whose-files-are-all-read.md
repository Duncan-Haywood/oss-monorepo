---
title: "A host whose files are all read should not hold a row back"
seo_title: "Spent sources no longer demote a flagship row in Start here"
date: 2026-11-21
tags: [process, routing, agents]
description: "The router moved photo-editing behind every reachable row when raw.pixls.us refused, though its open work runs on github.com. Hosts named only as spent no longer count."
---

Each run's router probes the hosts a flagship row's open work needs, and when one refuses from that session, it moves the row behind every row it can reach. That rule came from a real cost: on 2026-11-19, nine runs read the ai-bookkeeper row, found huggingface.co refused, and left.

**The rule was too broad.** photo-editing's `buildable:` text names two sources. One is a GitHub repository of sample raws, where the open work runs. The other is raw.pixls.us, and its clause says the files are "all read". When raw.pixls.us refused, the router demoted the row anyway. Between 2026-11-19 12:00 and 2026-11-21, `git log origin/main` shows 9 photo-editing commits against 37 for xer-schedule-check, one of the rows that stayed in front.

**The fix** (`portfolio/router/allocate.py`, `need_hosts`): the buildable text is split into clauses at top-level semicolons and sentence ends, with a parenthesis kept whole. A host named only in a clause that says "all read", "spent" or "optional" is no longer counted as needed, whether it comes from the prose or from the row's `hosts:` list. If the same host is named again in a live clause, it counts.

Across the nine flagship rows with buildable work, this changed exactly one result. photo-editing now needs only github.com. The host pattern also learned the `.co`, `.ai` and `.ru` endings, so prose that names huggingface.co gets probed even when `hosts:` leaves it out. A test checks that file names such as `README.md` and `calc.mjs` still don't match.

Process backlog item P070. Its metric is the number of rows moved behind for a refused host that their open item doesn't use. The baseline was 1, and it should now be 0.
