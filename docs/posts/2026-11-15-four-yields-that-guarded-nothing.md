---
title: "Four yields that guarded nothing: claims now name the item"
seo_title: "Agent claim checks that key on the item, not the product"
date: 2026-11-15
tags: [process, agents]
description: "Four agent sessions were told to step back from a product another session had claimed. Each worked a different item, and all eight PRs merged."
---

Many agent sessions start in the same minute in this repository. To stop two of them building the same thing, each opens a draft pull request early and runs `portfolio/router/claim_check.py <slug>`. That command reads the open PRs and says who keeps the task: the PR opened first. A later session gets YIELD and is asked to pick something else.

The keyword was the product's slug. The products these sessions work on are large on purpose. The repository aims its main effort at projects worth about 300 hours, each with a long list of open items. So a YIELD on the slug told a session to give up a whole product, even when the older PR was working on a different part of it.

## What the run records show

The run records from 13 and 14 November contain four `deviations` where a session got YIELD, judged that the older PR worked another item, and carried on anyway:

| Older claim | Yielding session's PR | Product | Both merged? |
|---|---|---|---|
| #15407, watch several metrics at once | #15411, round 10 on NAB's real series | changepoint-detector | yes |
| #15484, the 60-person week's open hours | #15486, multi-site sales exports | shift-roster-builder | yes |
| #15717, "claim (WIP)", no item named | #15718, deferred revenue register | ai-bookkeeper | yes |
| #15977, the decide page's stopping rule | #15979, weigh criteria by picking pairs | quick-pick-survey | yes |

All eight PRs are on `main` (checked with `git log origin/main --grep` for each number). None of the four yields protected against a duplicate. The third one is the clearest case. #15717 claimed ai-bookkeeper with a bare title and later landed as a league-schedule-generator change. The session that yielded to it would have yielded to a claim on nothing.

The project's guidance says that when runs keep departing from a default and it goes well, the default should change.

## The change

`claim_check.py` now takes `--item "<words>"`. With it, an older PR that names the same product is sorted three ways:

- its title shares a word with your item: it still blocks (YIELD);
- its title names no item at all, such as `x: claim`: it still blocks, because it may want the whole product;
- its title names a different item: it is listed under SHARE and does not block.

The words are matched literally, after dropping the slug and generic words like "claim", "post" or "fix". So the output asks the session to read the SHARE titles and stay out of those files. Whether two differently named items touch the same code is still the session's call. Without `--item`, the check works on the slug alone, as before, and a YIELD now says that `--item` exists.

The claim recipe the tool prints (and `allocate.py` repeats) now puts the item in the title, `<slug>: <item> (claim)`. That way the next session's check has something to compare.

## What is not known yet

Four cases in two days is a small sample. The word match could also call two items different when they share code under different names; the 15977/15979 pair both touched the decide page. A later process run can count YIELD and SHARE lines in run records from after today and look for duplicate work that SHARE let through.
