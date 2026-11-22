---
title: "Where P6's resource tree goes in Microsoft Project: the resource Group, and back"
seo_title: "Keep the P6 resource hierarchy converting XER to Microsoft Project"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer]
description: "461 of 502 resources in five public P6 files sit under a parent. The XER to Project converter now keeps that tree as each resource's Group, there and back."
---

P6 keeps its resources in a tree. A carpentry crew sits under "Trades",
which sits under "Labour"; the dozer and the paver sit under "EQP". Planners
group the resource sheet and the histograms by those branches, and a
contractor's cost report often rolls up the same way.

Microsoft Project has no resource tree. So when the [free XER to Project
converter](https://marisstella.app/xer-schedule-check/) wrote a P6 schedule
as Project XML, each resource came out flat, and the branches were gone.
Going the other way, a Project file turned into an XER had no parents at all.
Neither direction said so.

## How common is the tree?

In the six public P6 files the tool is checked on, five have resources.
461 of their 502 resources have a parent, up to three levels deep. The
Expressway file files 331 of 336 under 13 parents; the CCA file 117 of 119
under 14. None of those 33 parents is assigned to an activity. They exist to
hold the tree. That is why they were dropped: by default the converter only
writes resources the project's activities use.

## The Group field

Project's resource sheet has a **Group** column. People use it for exactly
this: grouping and filtering resources by trade or department. The converter
now writes each resource's parents there as a path of P6 resource IDs, from
the top down: `EQP`, or `CCAD Project/LABOR MANHOURS`. In Project you can
group the resource sheet by Group, and the branches come back.

On the way back to an XER, each step of the path becomes a parent resource.
When the file already holds a resource with that ID, it is used. When it
does not, a labour resource of that ID is added. A plain Group such as
"Electrical" from a Project file that never saw P6 becomes one parent named
"Electrical", which is where a P6 user would file the electricians anyway.

## What was checked

Through Project XML and back to an XER, every resource kept its parent path:
469 of 469 by default, and 502 of 502 with the "every resource" option. With
the default, the 33 parents are rebuilt from the paths and named by their IDs,
because an unassigned parent's full name is not in the XML. With "every
resource" the parents are written as resources and keep their names. The
XERs written passed the tool's P6 import checks, which now also look for a
missing parent and a loop in the tree. In MPXJ's collection of Project test
files, 14 of 14 work resources with a Group came back with the same Group.

What is not checked: an import into a real P6. Whether P6 matches a parent
by resource ID to a resource already in its global dictionary, or adds a new
one, is still open, as it is for every resource.

The measurements are in
[`eval/resource-hierarchy-2026-11-22.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/xer-schedule-check/eval/resource-hierarchy-2026-11-22.md).
The converter runs in your browser tab, and the XER is never uploaded.
