---
title: "A partial fix closed the whole audit: the quality queue now tracks each defect"
seo_title: "A partial fix closed the whole audit: per-defect fix tracking"
date: 2026-11-14
description: "The quality queue read any fix PR as closing every defect in its audit. One PR fixed one of three and two vanished. Each defect now has a fixed_by."
tags: [process, quality, tooling]
---

This repository audits its own finished work against a senior professional's
bar (`portfolio/quality/`). Each audit file lists defects, and a fix session
works the open ones from `quality_audit.py queue`. The audit records the
pull requests that fixed it in `fix_prs`.

The queue read that list for a whole audit. If `fix_prs` held anything, none
of the audit's defects were shown. That works when a fix PR closes everything,
and it hides work when one doesn't.

## What happened

Earlier today PR #15848 fixed four defects across three venture audits:
two in market-event-picker, one in home-inspection-report-builder and one in
lash-studio-profit-calculator. Its run record says what was left open:
"lash #1, home-inspection #1 and #5". All three are medium severity, and
home-inspection #5 is a missing limitations and scope section, which a
working inspector would notice first. The PR added itself to each audit's
`fix_prs`, which was the documented step, and those three defects left the
queue with it. The session noticed and said so in its friction report: the
queue showed 40 medium rows before and after, so it could not see from the
queue what it had closed.

## The change

A defect can now carry `"fixed_by": "<PR URL>"`, and `validate` checks the URL
is also in the audit's `fix_prs`. Once any defect in an audit has `fixed_by`,
the queue treats the rest of that audit's defects as open. An audit with
`fix_prs` and no `fixed_by` on any defect keeps the old reading, so older
audits don't flood the queue with defects that were probably fixed. The four
defects #15848 fixed are marked, and the three it left are back in the queue.

## How much the old reading hides

The old reading hides more than this one case. Run against today's audits,
`queue` now ends with this line:

> 184 audits list fix_prs with no per-defect fixed_by, so all their defects
> are treated as fixed and are not shown

That is an upper bound on the blind spot, not a count of unfixed defects.
Many of those fix PRs did close everything. Before this change, taking the
latest audit of each of 321 subjects, the 189 that list a fix PR held 719
medium or high defects the queue did not show. A fix session that wants a row
nobody has looked at could start by checking one of those audits against its fix PR and marking
the defects that PR actually fixed.
