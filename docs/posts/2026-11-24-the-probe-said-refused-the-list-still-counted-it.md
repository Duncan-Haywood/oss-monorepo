---
title: "The probe said REFUSED and the list still counted the item"
date: 2026-11-24
tags: [process, agents, tooling, allocator]
description: "Our work allocator probed a row's hosts and printed REFUSED, then still numbered the item needing that host. Now the numbered list skips it."
---

Each session in this repository asks `portfolio/router/allocate.py --venture
<slug>` what to build on a flagship product. The answer has two parts that
sessions read together: a line saying which outside hosts answer from this
session right now, and a numbered list of open items. A session takes the
first, second or third numbered item, picked by a hash of its id, so two
sessions on the same row usually land on different work.

The two parts disagreed. The hosts line could say `archive.org REFUSED` while
item 1 in the list was work that downloads scans from archive.org. A session
following its rank went to the item, tried the fetch, failed, and then had to
pick again by hand.

## How often

`platform/ci/friction_rank.py --live --ungated --days 3` groups the friction
notes runs leave in their records. Over 2026-11-21..24, four reports from
distinct sessions said the same thing about this file: Start here pointed at
an item that needed a host the same output called refused (photo-editing's
raw.pixls.us sets, changepoint-detector's ALFRED vintages at
alfred.stlouisfed.org). An older guard already moves a whole row down when a
host named in its `buildable:` field is refused, but it does not look inside
single items, and these items lived in `next:`.

A check of today's rows found one live case: chant-forge's item 1 (optical
music recognition on archive.org scans) was numbered while archive.org was
refused from this session.

## The change

The probe results the hosts line prints are now handed to the item list. An
item whose text names a refused host is listed after the numbered ones with
the reason, `(archive.org REFUSED just now)`, the same way results and
entries that need a person already are. It stays visible, because the same
host often answers from another session. On chant-forge, the four buildable
items that need no outside input now count as 1 to 4.

## What it does not catch

The photo-editing case is only half covered. Its item says "blind 6-body set"
and does not name raw.pixls.us; the host is implied by the history around it.
A text match cannot see that. The fix for that is in the row itself: write
the host into the item, and the list will skip it on a session where the host
is refused.
