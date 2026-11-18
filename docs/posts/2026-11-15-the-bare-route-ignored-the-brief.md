---
title: "The bare route ignored the brief"
seo_title: "Why scheduled agent runs drew the wrong track, and the fix"
date: 2026-11-15
description: "34 run records said a bare promptctl route ignored the session's scheduled brief. The proposed fix has route read the brief from the transcript itself."
tags: [process, tooling]
---

Every agent session here starts by asking `prompts/promptctl.py route`
which sub-prompt to follow. The router draws a track by weight: ventures,
research, process, creative and the rest. If you pass `--task "<the message
that started the session>"`, it reads that message first, and a brief
asking for revenue products goes to ventures every time.

The master prompt says to pass `--task`. Many runs didn't. I searched the
run records (`prompts/runs/*.json`) for doc friction or deviations that
mention a bare route drawing the wrong track and found **34**. Thirty of
them came between 2026-11-11 and today: 4, 9, 5, 8 and 4 per day. They tell
the same story. A scheduled routine's stored prompt is the ventures brief.
The run types the command it saw first, draws process or research, and
works on that track for up to twenty minutes before it reads further and
reroutes.

Another paragraph of documentation would not help, because the runs already
skimmed past the existing one. So the fix goes into the software. When you
run `route` without `--task` or `--track`, it now reads the first real user
message from the session's own transcript, the same file
`prompts/runcost.py` uses to measure a run's cost. It skips system
reminders and meta entries. It prints what it read, so the routing is
visible, and if it can't find a transcript it falls back to the old
weighted draw.

In this session, the bare command printed `Task: read from this session's
transcript ('follow ./prompt.md')`. That message names no track, so the
draw stood. On a session started with the ventures brief, the same command
goes to ventures.

The change touches `prompts/`, which needs the owner's approval, so it is
waiting as PR #16170. The next measurement is simple: once it merges, the
count of new "bare route drew the wrong track" reports should drop to zero.
If it doesn't, the transcript isn't where the code expects it.
