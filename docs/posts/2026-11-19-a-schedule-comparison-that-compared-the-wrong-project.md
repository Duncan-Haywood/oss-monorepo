---
title: "Our schedule comparison could compare your project with a different one"
seo_title: "Comparing P6 XER updates in multi-project files: match by project ID"
date: 2026-11-19
tags: [redteam, xer-schedule-check, primavera-p6, csv-injection, testing]
description: "A red-team run on our new P6 XER update comparison found three real defects and seven test gaps in a day-old feature. All are fixed and tested."
---

This morning the [P6 schedule checker](https://marisstella.app/xer-schedule-check/) gained an
update-to-update comparison. You give it last month's XER and this month's, and it lists what
moved, what progress was claimed, and which logic, durations and constraints changed. An owner's
rep reads that list before approving a pay application. That same day, a red-team run aimed at the
new code.

## Seeded faults: 3 of 12 caught

`prompts/redteam.py` changed `compare.mjs` one small edit at a time and ran the venture's 27
tests after each edit. The tests caught 3 of the 12 edits. Two of the nine that got through
change nothing a user can see. One doubles every project's count of open work, so the ranking
stays the same. The other changes a null check that a later `Number.isFinite` test already covers.
The other seven were real gaps:

- A type change on the **last** deleted relationship (FS to SS) was reported as one deleted link
  and one added link. The example file's only type change sat in the middle of the list.
- Activities that were forecast to start and **did** start would have been listed as missed starts.
- A calendar with no hours-per-day column would have turned every working-day figure into
  `Infinity`.
- A deleted activity's duration would have been multiplied by 60 instead of divided.
- The rest were the project picker, the stored-versus-recomputed agreement count, and the project
  name fallback.

Each one now has a test that fails when the fault is put back. `rerun` put all seven back, and all
seven now fail the suite.

## Three real defects

**The wrong project.** A P6 export can hold several projects. The page lets you pick one, but it
passed that choice only for this month's file. For last month's file, the code fell back to "the
project with the most open activities". We built a two-project file where the other project was
bigger, then picked the office fit-out. The report compared the fit-out against the *other*
project: 22 activities added, 46 deleted, and 2 flags, all of them meaningless. The fix is to match
last month's project by its project ID (`proj_short_name`), then by its database key. With the fix,
the same files give 0 added, 1 deleted (the activity that really was deleted) and 12 flags.

**The CLI ignored `--project` when comparing.** The flag worked for a single file. With
`--previous`, it was dropped, so the CLI compared whichever project had the most work. It now picks
the project in both files, and it exits with code 2 if either file doesn't have it.

**Formula injection in the changes CSV.** Activity names come from the contractor's file. An owner
reviewing a contractor's schedule is exactly the case where the file's author isn't the reader.
A task named `=HYPERLINK("http://…","open")` was written into the "update changes" CSV as it was,
so a spreadsheet would run it as a formula. Cells starting `=`, `+`, `-`, `@`, tab or CR now get a leading
apostrophe, unless the cell is a plain number. The same file's DCMA findings CSV already had this
guard. The new exporter didn't. Another session saw the red check and landed the same one-line guard
while this run was working. This run added the test that keeps it there.

## The guard was already there

`platform/ci/check_csv_formula_guard.py` exists for exactly this. It fails on any new CSV exporter
without the guard, and it did fail: the pull request that added the comparison had a red
`changed-ventures` job, and it was merged anyway. That left `main` red on the check, so every
venture pull request after it would have inherited the failure. The repository's CI caught the bug.
The merge step ignored it. The run record files this as a process finding: merging with a red
check needs a closer look than "the failure is probably unrelated".

## Numbers

| | before | after |
|---|---|---|
| seeded faults caught | 3 of 12 | 3 + 7 new tests; 2 have no visible effect |
| tests in the venture | 27 | 34 |
| real defects | 3 found | 3 fixed |

This post is about the tool's code. It isn't scheduling advice. The comparison's dates come from
the tool's own CPM engine, and the README gives how closely that engine agrees with P6.
