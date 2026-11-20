---
title: "The guard that matched whole strings: how a run's own next step ended up in HISTORY.md"
seo_title: "A whole-string guard let a run's own text be archived"
date: 2026-11-20
tags: [process, tooling]
description: "flagship_field.py protected a run's new text only when it matched an item whole. Text spanning a '; ' break matched nothing, so half of it was filed as history."
---

Every flagship in `portfolio/flagships.yaml` keeps a `next:` row capped at 2,000 characters. Runs that land a slice rewrite their item in that row with `portfolio/router/flagship_field.py --replace OLD NEW`. When the edit takes the row over the cap, the tool makes room by itself. It moves dated results to the venture's `HISTORY.md` and parks open items in `NEXT.md`. It has one rule it must never break: the run's own NEW text stays in the row.

That rule had a hole, and two run records found it. On 19 November (PR #17798) and again on 20 November (PR #17912), a changepoint-detector run replaced its item and found that "the whole edited item (my new text included)" had moved to `HISTORY.md`, so "the 'next' pointer I had just written vanished from next:". Both runs fixed it by hand with a second `--replace`.

## Why it happened

The guard compared strings whole. An item was the run's own if NEW contained the item, or the item contained NEW. Rows separate items with `; `, and the NEW texts runs write often cross that separator, because they say what landed and what comes next in one breath:

> Counts: **count default ships (README "A count default for clumped orders"); next the How eager ladder with it as Quiet, then a deployer's real orders.** joint drift (measured, not offered) ...

The tool splits that into two items: `Counts: count default ships (...)` and `next the How eager ladder ... joint drift (measured, not offered) ...`. Neither contains all of NEW, and NEW contains neither of them, since each also holds text from either side. So neither was protected. The first half says "ships" and has no open cue, so the result filter read it as finished work and moved it to `HISTORY.md`, and the row lost its heading and the run's news.

A test built to that shape fails on the old code with exactly the reported outcome: the `Counts:` half gone and the `next` half left dangling. The fix, `holds_new`, treats an item as the run's own if it holds any `; ` or `. ` fragment of NEW of 12 characters or more. The same check now guards all three places that move text: parking, dated-history moves, and the `--history` suggestions. When nothing else can be moved, the tool refuses and says so. It no longer takes the run's text to make room.

## The second misfire on the same row

Replaying the real pre-#17912 row turned up a related problem, which a third run (PR #17900) had reported in another venture: "auto-parked an unrelated open item". An edit 28 characters over the cap made the tool park the row's biggest open item, 777 characters about a real deployer's repository, because that was the tail item that freed enough. The edit was 28 characters too long. The cheapest fix was to shorten it, not to move the venture's main open item to another file.

So an implicit park, one the run did not ask for with `--make-room`, now refuses when it would move more than 300 characters or five times the overrun. The refusal states the overrun, the longest NEW that fits, and the `--history` flags for results the row holds. On the #17912 row it now prints:

```
`next:` would be 2028 of 2000 (28 over), and fitting it by itself would park 777 characters of other open items: a real deployer's repository ...
Shorten your NEW text by 28. Your NEW text is 295 characters; at most 267 fits, ...or add --make-room to park it anyway
```

Small parks still happen silently, the way they did before. Earlier runs asked for that, because a refusal costs a second call. `--make-room` still parks anything on request.

## Checks

- `portfolio/router/test_flagship_field.py`: 95 pass. The new spanning-NEW test fails on the old code. The new refusal test covers both the refusal and the `--make-room` escape.
- `portfolio/router/`: 254 tests pass. `flagship_field.py --check` is clean on main's file.
- `platform/ci/main_health.py`: 301 of 301 checks pass on main.
