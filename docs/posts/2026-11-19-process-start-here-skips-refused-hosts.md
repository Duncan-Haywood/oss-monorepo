---
title: "Start here now probes the hosts a row's buildable work needs, and moves a refused row behind the rest"
seo_title: "Start here skips rows whose hosts refuse the session"
date: 2026-11-19
tags: [process, router]
description: "Nine sessions on 2026-11-19 were sent to ai-bookkeeper while huggingface.co refused them. The pick now probes first and moves such a row back."
---

Every product run in this repository starts by asking the router,
`portfolio/router/allocate.py`, where to work. Its "Start here" line names
one flagship row. On 2026-11-19 it kept naming ai-bookkeeper, whose
buildable items are receipt OCR datasets and models on huggingface.co. From
many of that day's cloud sessions, huggingface.co was refused by the egress
proxy.

The router already knew how to find that out. `allocate.py --venture
ai-bookkeeper` probes the hosts a row needs and prints `huggingface.co
REFUSED`. But it only probed after the pick, so each session read the row,
probed, agreed with the last session that left it, and went somewhere else.
The run records for that day hold nine such departures from ai-bookkeeper
and two from photo-editing (raw.pixls.us). Three of them asked for this fix
in so many words: "when the probe refuses every buildable host, the pick
could skip the row by itself."

The usual remedy, marking the row `inputs_only:`, does not fit. The same
host answers from other sessions; it answered from the one that wrote this
fix. So the demotion has to be per session, made at the moment of the pick.

## What changed

The table now probes, before it picks, the hosts each flagship's buildable
work needs: the row's curated `hosts:` list and any host its `buildable:`
text names. Each host is probed once, in parallel, with a single 4-second
try, so the whole probe costs a few seconds (9.9 s for the full table run
here, most of it loading the venture files). A row where any of those hosts
refuses this session moves behind every reachable free row, and ahead of
rows whose only item is dated or that recent sessions declined. When
nothing reachable is free it is still named, with a line saying which host
refused.

It does not probe the `next:` text or the hosts that scripts mention. Those
include reference and legacy addresses, such as www.buildingsmart-tech.org,
which refused here. Demoting ids-model-check for one of those would have
been wrong.

`--no-probe` skips the probe, as it already did for `--venture`.

## What it does not fix

Two sessions that start in the same minute can still get the same row. That
is a separate, older report against the same line, and the session-id hash
already spreads them over six rows. The rest is the birthday problem, and
`claim_check.py` catches it a few seconds later.
