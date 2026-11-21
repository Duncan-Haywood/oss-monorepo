---
title: "Re-audit: the YouTube chapters checker's fixes hold, from 1 of 5 seeded bugs caught to 11 of 12"
seo_title: "Why 29.97 fps chapters land seconds early on YouTube"
date: 2026-11-21
tags: [quality-audit, evaluation, testing, youtube]
description: "Two fix PRs on the YouTube chapters checker closed every defect credited to them. A 29.97 marker at 1:00:00:00 is 3603.6 s of video, not 3600."
---

The [YouTube chapters checker](https://marisstella.app/youtube-chapters-check/) reads a chapter list,
checks it against YouTube's three rules (start at 0:00, at least three timestamps in ascending order,
every chapter at least 10 seconds) and converts Premiere, DaVinci Resolve and Audacity markers. The
[2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-youtube-chapters-check.json) found eight
defects and scored it below the bar. PRs #17049 and #17156 followed. Today's
[re-audit](../../portfolio/quality/audits/2026-11-21-youtube-chapters-check.json) re-ran every one of
the eight against the code on `main`.

Some re-audits this week found that a fix PR had mostly written the defects down. This one didn't.

## What the fixes closed: 5 of 5 claimed, 5 of 8 overall

- **DaVinci Resolve conversion.** It was claimed in three places and did not work: a Resolve marker
  EDL came out as chapters titled `001 001 V C 01:00:00:00 ...`. Now an EDL with a 01:00:00:00
  timeline start becomes `0:00 Intro / 2:30 Setup / 10:00 Wrap up` at both 24 and 29.97 fps. The README
  says the test files are hand-written in Resolve's layout, not exported from Resolve.
- **29.97 and 23.976 timecode.** Fixed; the next section explains it.
- **Silent drops.** A line with an impossible time (`11:75`) used to vanish from the cleaned list
  without a word. Now the list says "Left out line 6".
- **WebVTT.** Titles containing `-->` are now written as `->`, so they no longer end the cue early.
- **Tests.** Last time 4 of 5 seeded bugs survived the suite. This time 11 of 12 were caught, the
  original five included.

Three low-severity defects had no fix PR, and all three were still open. This round's PR fixes them.
Range lines like `0:00 - 1:30 Intro` came out titled `1:30 Intro`. Audacity labels exported in a
decimal-comma locale (`12,500000`) gave "No timestamps found". The FAQ didn't say that YouTube also
withholds chapters from channels with active strikes or from videos that may be inappropriate. A
missing or unreadable video length was skipped without telling the user. The same PR rewrites the page
note that said impossible lines were "left as it was", which contradicted the list below it, and adds
the test that kills the one surviving mutant (a chapter starting exactly at the video length).

Scores went from correctness 2, verification 2 and claims 2 to 3 on all seven dimensions. The product
now **meets the bar**. Those scores are for the code before today's PR, so the next re-audit will
judge that PR.

## Why a 29.97 marker lands 3.6 seconds early per hour

A frame rate of "29.97" is really 30000/1001 frames per second. Non-drop timecode still counts 30
frames to every labelled second, so the label runs slow against the clock. A marker at `01:00:00:00` is
3,600 × 30 = 108,000 frames, and 108,000 × 1001 / 30,000 = **3,603.6 seconds** of real video. The
same goes for 23.976: `00:30:00:00` is 43,200 frames, or 1,801.8 seconds.

If a converter reads the label as clock time, every chapter comes out early, by 3.6 seconds an hour.
On a three-hour stream the last chapter starts 10.8 seconds too soon. Drop-frame timecode (written
with a `;`, as in `01:00:00;00`) skips frame numbers so the label tracks the clock, so it needs no
correction. The checker now does both. Pick your sequence's real frame rate in the dropdown; if the
timecode has a semicolon, it's drop-frame.

## How this was checked

The suite has 40 tests, all passing; 12 bugs were seeded by hand with `platform/ci/quality_mutate.py`.
The timecode, EDL and boundary outputs were recomputed by hand from SMPTE ST 12-1 and CMX 3600. Each
command and its output is in the audit file. One limit: YouTube's help page couldn't be fetched from
this session, so the three rules are as quoted by the 2026-11-17 audit's live fetch.
