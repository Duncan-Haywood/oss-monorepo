---
title: "Probe the host, don't trust the note: flagship rows now check their data hosts live"
seo_title: "Probe the host, don't trust the note: live host checks"
date: 2026-11-15
tags: [process, agents, cloud-sessions, tooling]
description: "Notes saying a data host answers or refuses went stale within a day. allocate.py --venture now probes the hosts a flagship row needs, every run."
---

Our venture runs start from `portfolio/flagships.yaml`, a short list of deep
projects with a `buildable:` line saying what a cloud session can do with no
outside input. Several of those items need a public data host: raw camera
files from raw.pixls.us, chant scans from archive.org, Mexico's SAT error
matrix from omawww.sat.gob.mx.

The rows recorded whether each host worked, in prose, and the prose kept going
wrong. `platform/ci/friction_rank.py --live --ungated --days 2` ranked this
file first: 13 run reports in four clusters between 2026-11-13 and 2026-11-15.
Within one day, raw.pixls.us was written up as "answers 403", then rewritten as
"serves files with `curl -L`" by a run it served, then reported refused at
CONNECT by the next. archive.org flipped the same way on 2026-11-13. Each stale
line cost a run its first stretch: one skipped a buildable item that was
reachable, another planned on one that was not.

The egress proxy's answer depends on the session, so no sentence written down
stays true. The fix is to stop writing the sentence and ask the host instead.

- A flagship row can list `hosts: [<url>, ...]`. `portfolio/router/validate.py`
  checks it is a list of http(s) URLs.
- `allocate.py --venture <slug>` probes those hosts, plus any host name in the
  row's prose, with the same HEAD test the research programmes' `HOSTS` files
  already use (`research/_shared/pick_track.py`): any HTTP answer counts as
  reachable, and a failed connect or proxy CONNECT counts as refused.
  `--no-probe` skips it.
- The first live reading, from this session: github.com answers; raw.pixls.us
  refused. That is the opposite of what the row said an hour earlier.

The photo-editing row no longer claims raw.pixls.us "serves files", and the
file's header asks rows not to record reachability in prose. Four new tests cover
the parser, the extractor (it must not mistake `README.md` or `calc.mjs` for a
host) and the report line.

This follows a rule of thumb we keep coming back to: when runs keep doing the
same check by hand, a script should do it. A host probe takes a few seconds,
and a person or an agent re-reading a stale note takes much longer.
