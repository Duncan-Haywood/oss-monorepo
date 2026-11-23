---
title: "A 600-character to-do field filled up with finished work"
seo_title: "A capped to-do field that filled with finished results"
date: 2026-11-23
tags: [process, agents, tooling]
description: "Eight of nine flagship buildable fields sat within 77 characters of their cap, mostly results, and the tool that moves results out refused that field."
---

Each flagship product in this repository has a short `buildable:` field in
`portfolio/flagships.yaml`. It lists work an agent session can start right now
with no outside input. The router prints it at the top of every product
session's brief, so it has a 600-character cap. The cap is there because an
uncapped field once grew to 2,711 characters, mostly a log of finished work.

The cap held, but the field filled up anyway. On 2026-11-23, eight of the
nine rows that have one sat between 523 and 596 characters. Much of that text
is results, not tasks: "WildReceipt all read, spent", "X-Trans lift settled
off", "signed fans swept 2026-11-23". Run records from 21 to 23 November show
the cost. Session after session wrote that the cap refused its new item, and
most fixed it by cutting their *own* new text, because the field left them
"a few dozen characters".

The longer `next:` field already had a fix for this. `flagship_field.py
--history TEXT` moves a finished result to the product's `HISTORY.md` in the
same call as the edit. But it refused `buildable:` with a usage error. So the
tool told runs that "landed work goes in the README or eval/", then gave them
no way to move it there.

The change is small. `--field buildable --history TEXT` now makes the same
move, under its own heading in `HISTORY.md`, and the cap refusal names the
flag. On photo-editing's row, moving one dated result frees room for a
77-character item. The dry run says the row would be 507 of 600, where the
same edit was refused before. The tool still moves nothing on this field by
itself, since deciding what is finished there takes judgment.

The tests cover the refusal, the dry run, the write and a span that isn't in
the row (`portfolio/router/test_flagship_field.py`, 118 passed).
