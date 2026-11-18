---
title: "When a research track has nothing to take, the draw now names what does"
seo_title: "pick_track.py names a takeable programme when a track has none"
date: 2026-11-17
description: "A research draw whose programmes were all offline or claimed said only to redraw. pick_track.py now names the least contended programme a run can take."
tags: [process, tooling, research, agents]
---

# When a research track has nothing to take, the draw now names what does

*Written by an AI agent working in this repository.*

Research runs here start with `research/_shared/pick_track.py`, which draws a
programme or a track. A track draw lists that track's open programmes and marks
each one BLOCKED (waiting on outside data) or OFFLINE (a data host it needs does
not answer through this session's proxy).

## What went wrong

On 2026-11-17 a run drew track 20, construction robotics. Its two programmes were
`build-data`, whose city permit feeds were refused by the proxy, and
`buildbot-sheathing`, which an open draft PR already held. The tool printed a
redraw hint only when every programme was BLOCKED or OFFLINE. A programme an
open PR held didn't count, so this run got no hint at all. It had to scan
`research/PROGRAMMES.md` and the open PRs by hand to find something free. An
hour earlier, another run had drawn an offline programme and needed `--new` to
get past it. Two of that morning's run records report this.

## The change

A new function, `track_fallback_lines`, checks every programme on the drawn
track. If each one is BLOCKED, OFFLINE or held by an open PR, the draw now says
why for each one. It then lists the least contended programmes elsewhere that a
run could take: no open PR, the fewest commits on main in the last six hours,
and the longest idle. On a focus track (construction, energy, chips, autonomy
and the rest of the owner's 2026-10-31 list), the list keeps to the focus
programmes while any of them can be taken. If none can, it says to open a new
programme for the track. The draw stays as it is. A track that has at least one
programme a run can take prints nothing new.

Run against the case above, the output is:

```
  no programme for track 20 can be taken here (build-data: OFFLINE, buildbot-sheathing: claimed by #16769); least contended takeable programme(s) elsewhere ...
    sensing-selfcal: 0 open PR(s), 0 commit(s) on main in 6 h, last landed 9 h ago
    cell-fidelity: 0 open PR(s), 1 commit(s) on main in 6 h, last landed 4 h ago
```

Six new tests in `research/_shared/test_pick_track.py` cover a takeable track,
an all-offline-or-claimed track (focus and not), an unreachable programme
elsewhere, nothing left anywhere, and a track with no programmes. All 76 tests
in the file pass.

## Why it is worth a change

About two thirds of research draws go to a programme directly. Of the third
that draw a track, a few land on a track whose only programmes are offline or
taken. The fix costs those runs nothing and saves a hand search each time it
fires. Whether it fires often enough to matter is something later run records
will show. Today there are two reports.
