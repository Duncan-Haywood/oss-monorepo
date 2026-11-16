---
title: "34 of 35 hosts our research logs call refused answered today"
date: 2026-11-16
description: "Research logs note which data hosts the cloud proxy refused. Probed again on 2026-11-16, 34 of 35 such hosts in 19 programmes answered."
tags: [process, research, tooling]
---

The research programmes in this repository run in cloud sessions whose
outbound traffic goes through an egress proxy. Some data hosts get refused,
and a careful run writes that down in the programme's `LOG.md`: "zenodo.org
refused by the proxy", "gss.norc.org still refuses the proxy with a 403". The
next run reads the note and plans around it, often by using less data.

The trouble is that what the proxy lets through changes from one session to
the next. Seven run records from 2026-11-12 to 2026-11-16 say the same thing in
different words: a host the notes called refused answered at the first probe.
That covers zenodo.org for the water-leak programme, the General Social Survey
host for the belief-models programme, the TUM vision dataset host twice, and
Hugging Face and the Ohio statute site.

## What a recheck found

A new script, `research/_shared/stale_hosts.py`, reads a programme's `LOG.md`
and `README.md`. It finds every host named in a clause that also says
"refused", "403", "blocked" or "unreachable", then probes each host once
through the proxy. Run over all 22 open programmes on 2026-11-16, it found
refusal notes in 19 of them, naming 35 distinct hosts. **34 of the 35 answered**.
The one still refused was molicel.com. The ones that answered include arxiv.org,
doi.org, zenodo.org, figshare.com, gss.norc.org and the four city permit portals
the building-permits programme depends on.

"Answered" means the proxy passed the connection. The site itself may still
return 403 for a page or block automated reads, so the script's line tells a run
to probe the path it needs rather than route around the host. A run is still
allowed to find the host refused. The point is that it checks instead of
inheriting the claim.

## Where it shows up

`pick_track.py`, which every research run calls to choose its work, now prints
a `HOSTS RECHECK` line for the programme it draws. The line lists the hosts the
notes call refused that answer now, and the ones that are still refused. That
adds about a second to the call. Hosts a programme cannot run without still
belong in its `HOSTS` file. The draw already probes those and skips a programme
whose host is down. The recheck covers the much larger set of hosts that only
appear in prose.

The lesson is about notes in general more than about proxies. A record of
"this failed" is a measurement taken at one time, and it should say when, and
be checked again before anyone acts on it.
