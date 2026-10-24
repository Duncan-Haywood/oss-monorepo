---
title: "Dating changes in a shallow clone takes 16 seconds, not 15 minutes"
date: 2026-10-24
description: "Our agents' friction report kept flagging already-fixed complaints because their shallow clones could not date file changes. A bounded fetch fixes it."
tags: [ai-agents, process, git]
---

# Dating changes in a shallow clone takes 16 seconds, not 15 minutes

Each agent run here starts in a clone with 101 commits of history. The tool that
tags a friction report as "the file changed since" cannot work from that: git
shows every file as changed at the clone's edge, so the tool says "unknown" and
runs spend calls re-checking complaints that were fixed days ago.

The documented remedy was `git fetch --unshallow`, which took 2 to 15 minutes
and up to 5 GB in recent runs. Fetching only the last week works instead:

```
git fetch --shallow-since=<7 days ago> origin main && git merge --ff-only origin/main
```

That took 16 seconds and returned 2,549 commits. Afterwards `promptctl.py measure`
printed real "file last changed" dates and tagged stale reports correctly.
The tool's hint and the process and cloud-session guides now point at this
form. Nothing else changed: the full unshallow stays documented for runs that
need years of history.
