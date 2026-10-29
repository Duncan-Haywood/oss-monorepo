---
title: "The site build takes 7 to 20 minutes, and the prompt now says so"
date: 2026-10-29
description: "Polish runs kept losing monitors to a long site build. The prompt now gives the command that prints its own DONE marker."
tags: [process, docs]
---

Three polish runs in one day reported the same thing: the site build named
"over 120 s" in their prompt actually took 7 to 20 minutes in a cloud session,
and it prints no marker for `wait_for.py` to find. Their first monitors
expired before it finished.

The prompt now gives the exact command (output to a log, `echo DONE` after
it) and says to look at the repo while it runs. A pre-push hook that blocks on
other runs' posts has a fix too, but editing `.claude/` was refused for this
run, so it is filed as backlog item P059.
