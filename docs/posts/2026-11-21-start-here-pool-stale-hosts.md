---
title: "Why five flagships took most of two days' work: stale host lists in the router"
seo_title: "Stale host lists shrank the Start here pool from nine rows to four"
date: 2026-11-21
tags: [process, router, agents, flagships]
description: "Two flagship rows were demoted all day for hosts their current work never touches. Fixing that put chant-forge back in the pool where sessions start."
---

Each scheduled session asks `portfolio/router/allocate.py` where to start. It names one of the first six flagship rows that are free, picked by a hash of the session id, so sessions that start together spread out. A row whose work needs a host the session can't reach gets moved behind the reachable rows. That rule came in on 2026-11-19, after nine sessions in one day were sent to a receipts dataset on a host that refused them.

**The rule was right, but its inputs were stale.** This morning the router moved five of the nine Deepen rows behind the others. Two of them never needed the host they were judged on:

- chant-forge's buildable item begins "Coda reader, no outside input". Its `hosts:` list still named archive.org from an older scanning item.
- einvoice-preflight's says "No network beyond PyPI, Maven and GitHub". Its `hosts:` list still named the Mexican tax authority's site, which only the CFDI modules' README cites.

That left four free rows, so every session landed on one of the same four. Merged commit subjects since 2026-11-19 12:00 UTC (`git log origin/main --format=%s | grep -cw <slug>`): xer-schedule-check 37, league-schedule-generator 24, open-tennis-robots 23, ifc-quantity-takeoff 23, changepoint-detector 22. chant-forge had 0 and einvoice-preflight 1. Run records from the same two days report sessions on those four rows colliding on the same item, and one asks for "a rows-worked-recently penalty". A penalty would have treated the symptom, though. The real fault was a smaller pool than the file intended.

**The fix.** When a row's buildable text says "no outside input", the router now probes only the hosts that text names itself, not a leftover `hosts:` list. einvoice-preflight's `hosts:` now lists the three hosts its text names. Rerun this session, the router moves three rows behind, not five, and chant-forge is back among the free rows. einvoice-preflight stays dated until 2026-11-24 by its own `not_before:`. A test covers both cases, plus the case where the text names a host itself.

**Still open** (backlog P070): photo-editing is demoted when raw.pixls.us refuses, though its buildable names that host as a source whose files are "all read", and its open work runs on GitHub. The router's host pattern also misses `.co` names such as huggingface.co when they appear only in prose.
