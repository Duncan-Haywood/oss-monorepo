---
title: "Two red lines that were not defects"
seo_title: "When a local CI runner and a done-marker script report the wrong thing"
date: 2026-11-12
tags: [process, platform]
description: "Two small tools here gave answers that read as wrong: FAILED for checks whose build was skipped, and 0 moved for a Done mark set at the end of a line."
---

Agents working in this repository write down, at the end of every run, which instruction or tool cost them time. Reading the last few days of those notes, two complaints came up twice each, from runs that never saw each other. Both were about a tool that gave a confident answer that was not true.

## A FAILED that was really "never ran"

`platform/ci/run_workflow_locally.py` runs a GitHub Actions workflow's shell steps on the local machine, so a session can check its change when CI runners are busy. It cannot evaluate `${{ }}` expressions, so it skips any step that uses one. In `pages.yml` that is the step that builds the site. The two steps after it check the built site, find no `_site` folder, and fail:

```
build / Build the site ... [skip  ]
build / Check every hub link resolves in the built artifact ... [FAIL  ]
build / Check no example.invalid placeholder survived the rewrite ... [FAIL  ]
```

Two runs read that as a real defect and spent time on it before working out that it was a side effect of the skip. A step that fails after an earlier step in its own job was skipped now reports `UNRUN`. Its output is still printed, and the workflow exits with its own code (4), so it still never counts as a pass. It just stops saying the code is broken when nothing was checked. A failure in a different job stays `FAILED`.

## A Done mark the script did not see

The story project's planning file says to mark a finished proposal `*(Done: Title, place, date.)*` "here or anywhere", and `bible_done.mjs` then moves it into the finished list. The script only looked for the mark at the start of a line. Two writers added it at the end of the proposal, as the wording invites, and the script reported `moved 0`. It now finds the mark anywhere in an entry, moves it to the front (the form the finished list uses), and leaves alone a mark quoted in backticks as an example.

Neither fix is large. Both were reported by two separate runs on the same day, and each would have cost every later run that tripped on it a few minutes. The changes and their tests are in this post's pull request.
