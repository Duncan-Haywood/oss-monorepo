---
title: "Probe the data host before the draw: one research programme lost 10 starts to a 403"
seo_title: "Probe data hosts before an agent picks the work: a 403 fix"
date: 2026-11-11
tags: [process, ai-agents, research, cloud-sessions, egress-proxy, tooling]
description: "Ten of 75 build-data sessions opened on a refused Socrata feed. The research draw now probes a programme's data hosts first and moves on when one is down."
---

Research runs in this repository start by drawing a programme with
`research/_shared/pick_track.py`. The draw already skipped a programme that an
open pull request holds and one with a `BLOCKED` file. It could not see the
problem one run reported today: build-data, which compares building-permit
timelines across four cities, needs all four cities' Socrata feeds, and the
cloud session's egress proxy refuses them in some sessions and not others.

## The numbers

`research/build-data/LOG.md` has 75 session entries. Ten of their headings say
the feeds were unreachable, refused or that the session worked offline
(sessions 4, 41, 43, 48, 56, 57, 68, 70, 72 and 73), and 21 of its lines mention a
403, a refused CONNECT or an unreachable host. A `BLOCKED` file would be wrong here, because the feeds do
come back: session 74 pulled all four at 01:07 UTC, a few hours after session
73 had found every host refusing CONNECT at 22:27. The block belongs to the
session, not the programme.

Other programmes show the same pattern. Counting the same
lines in each open programme's log:
aerolog-scaling 23, build-data 21, marine-hull 14, heavy-hydraulics 11 and
llm-coding-inference 10. Most of those have offline next steps as well, so only
build-data gets a host list today.

## The change

A programme can now list the URLs its next steps cannot run without in
`research/<slug>/HOSTS`. When the draw lands on one, `pick_track.py` sends a
HEAD to each host through the proxy in parallel. Any HTTP status counts as up;
a failed connection or a refused CONNECT counts as down. If a host is down, the
draw moves on to the next programme and prints why:

```
redrawn past a programme (its data host does not answer): build-data: needs https://data.seattle.gov/ (research/build-data/HOSTS), which did not answer from this session
```

If every unclaimed programme is down, the first of them still stands, so the
draw never comes back empty.

The first version used one HEAD with a 6-second timeout. That was too eager:
data.seattle.gov timed out on 2 of 5 single probes this session and answered
in under 2 seconds on the rest, so a single probe would have skipped a
reachable programme. Each host now gets up to three tries. Six runs of the full
four-host probe then took 0.8 to 3.2 seconds and found every host up.

Programmes without a `HOSTS` file are never probed, and the unit tests stub the
probe out so they make no network calls (one existing test, which draws 4,000
times over a fixture that includes build-data, would otherwise have sent real
requests).

## What it does not do

It checks reachability, not whether the data changed or is complete. A
programme with both offline and online next steps should not list its hosts,
or the draw will pass over offline work it could have done. And the list is
kept by hand: when a next step stops needing a host, its line should go.
