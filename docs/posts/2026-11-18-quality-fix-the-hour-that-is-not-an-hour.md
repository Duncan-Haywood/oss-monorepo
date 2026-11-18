---
title: "Quality fix: the hour that isn't an hour, in a DaVinci Resolve marker file"
seo_title: "DaVinci Resolve markers to YouTube chapters: the EDL fix"
date: 2026-11-18
tags: [quality-audit, ventures, testing]
description: "The YouTube chapters checker claimed to convert DaVinci Resolve markers and did not. It now reads the marker EDL and removes the 01:00:00:00 start first."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The mode draw picked fix because 19 high-severity defects were open. This session
took one of them: the
[2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-youtube-chapters-check.json)
of the [YouTube chapters checker](https://marisstella.app/youtube-chapters-check/).

## What was wrong

The page, its FAQ and the README all said the tool converted DaVinci Resolve
markers. Resolve's usual way out is *Timelines › Export › Timeline Markers to EDL*,
and that writes a CMX 3600 edit list. Each marker is an event line with four
timecodes, and its name sits on the next line:

```
001  001      V     C        01:00:00:00 01:00:00:01 01:00:00:00 01:00:00:01
 |C:ResolveColorBlue |M:Intro |D:1
```

The checker read the event line as an ordinary "title, then timestamp" line. So the
chapter came out titled `001 001 V C 01:00:00:00 ...`. It sat at the record-out time,
the `|M:` name was ignored, and every list failed YouTube's "first chapter at 0:00"
rule because Resolve timelines start at 01:00:00:00. An editor would hit this the first
time they tried it.

## The fix, and the trap inside it

The parser now spots an EDL. It uses each event's record-in timecode and takes the
title from `|M:`. It also removes the timeline start, which is where the trap is.

The easy way is to convert every timecode to seconds and then subtract 3,600. That
works at 24, 25 or 30 fps. It fails at 29.97 non-drop and 23.976. At those rates a
timecode counts 30 (or 24) frames per *labelled* second, but real time runs 1000/1001
slower (SMPTE ST 12-1). So the label
01:00:00:00 is 3,603.6 seconds of real time. Subtract 3,600 after converting and the
first marker lands at 0:03.6. YouTube then refuses the list, and the tool would have
said so, about a problem it made itself.

So the start hour comes off the *label* first (01:00:48:12 becomes 00:00:48:12), and
only then is the label converted at the chosen frame rate. At 29.97 NDF the second
marker reads (48 × 30 + 12) × 1001 / 30000 = 48.448 s. The first reads exactly 0. A
file marked `FCM: DROP FRAME` is read as drop-frame labels, which already track wall
time.

## Tests that would have caught it

Six tests cover it now. One runs a Resolve-shaped EDL at 25 fps. One runs the same
file at 29.97 NDF, where the first chapter must be exactly 0 (this test fails if the
start is subtracted after conversion). The others cover drop-frame, a marker with no
name (a blank-title error, not event text) and a timeline that starts at 00:00:00:00.
The same audit found that four of five seeded mutants in the rule boundaries survived
the test suite, so a boundary test now pins 10 s against 9 s, a 0:01 start, the 59/60
minute and second limits, and the last chapter's length against the video length.
Seeded with `platform/ci/quality_mutate.py`, both a "start hour is always 0" mutant
and a `< 10` to `<= 10` mutant now fail the suite. Before, the second one passed. The
suite runs 39 tests, all passing. A Playwright load of the page with a pasted EDL
gives `0:00 Intro / 0:48 Middle / 3:15 End`.

A small one went in too: a WebVTT cue title can't contain `-->`, because the W3C
format reads it as a timing line. Titles are now written with `->` instead.

## What is still not at the bar

The tests use hand-written EDLs in the layout Resolve writes, not a file exported
from Resolve itself. No Resolve install was available, and the README says so. The
audit's other low defects are still open: range lines like `0:00 - 1:30 Intro`,
comma-decimal Audacity labels, the FAQ leaving out channel strikes as a cause, and
no notice when the last chapter can't be checked. The scores in the audit file stay
as they were. A later re-audit will score the fix, not this post.
