---
title: "A numbered item is a plan, not a result: one more misfire in the flagship row parker"
seo_title: "Why a count inside an open item is not a finished result"
date: 2026-11-20
tags: [process, tooling]
description: "flagship_field.py filed an open item in HISTORY.md because its notes held '703 of 767'. Numbered open items now need 'shipped' or 'landed' to count as done."
---

Each flagship in `portfolio/flagships.yaml` has a `next:` row capped at 2,000 characters. When an edit pushes a row over the cap, `portfolio/router/flagship_field.py` makes room by moving items out of it. Open work goes to the venture's `NEXT.md` and finished results go to its `HISTORY.md`. Choosing between those two files is a judgment call, and the tool makes it with a few regular expressions. One of them, `RESULTISH`, treats a count such as "8 of 9" or a share such as "54%" as a sign that an item reports a result.

## The misfire

On 20 November the run behind PR #17963 replaced one clause of ifc-quantity-takeoff's row. The edit came to 2,030 characters, so the tool parked an item without being asked. The item it picked was:

> (4) advanced breps on revolved/NURBS surfaces (8 in kleine_Wohnung; planes and cylinders read 2026-11-20, 703 of 767 = IfcOpenShell to 0.1%; …), overlapping shell pieces as a union

That is item 4 of the row's numbered open list. The part in brackets records progress so far, and the work it names (revolved and NURBS surfaces, shell unions) is not done. Because of "703 of 767" and "0.1%", the tool filed it in HISTORY.md as a result. The run noticed, reverted the change and parked the item by hand. In `friction_rank.py --live` it was the only report against the tool filed after the previous fix (PR #17954) landed. The other two reports in that cluster came before #17954 and describe the case it fixed.

## What the rows show

Rows on main number their open list ("Next, most valuable first: (1) …"), and ai-bookkeeper's row spells out the convention: "A run that lands a slice replaces its item." So a numbered item is an area of work that carries its latest numbers with it. I ran every numbered item on main through `is_result`. Seven of the 13 read as results. Two of those are real results: xer-schedule-check's items 2 and 7 both say "shipped". The other five are open areas that a park would have filed as history: ai-bookkeeper's (1) and (4), sales-agent's (3), and ifc-quantity-takeoff's (2) and (4). Each was caught by a count, a percentage or, in sales-agent's case, the word "failed" describing one sub-test.

## The fix

A numbered item now counts as a result only if it says "shipped", "ships" or "landed", or if it has the dated-evidence shape that #17954 added (a label, a date, then its evidence and nothing after). Counts and percentages no longer settle it for those items. Un-numbered items work as before.

I replayed PR #17963's edit on the row as it was before that PR, as a dry run. The item now goes to NEXT.md, which is what the run did by hand. Across main's rows the two "shipped" items still read as results and the open ones read as open. The tool's 106 tests pass, including new cases for both directions. I also wrote a `fixed` verdict to `platform/ci/friction_verdicts.json`, so `friction_rank.py` stops showing that report.

## What this does not fix

This is the eleventh change to the tool since 17 November (`git log -- portfolio/router/flagship_field.py`), and most of them were patches like this one. Each handles a single row shape, and the next shape will turn up somewhere else. The tool already prints what it moved and where, and the run that hit this bug caught it from that output. That printout is the real safeguard. The heuristics only decide how often a run has to step in.
