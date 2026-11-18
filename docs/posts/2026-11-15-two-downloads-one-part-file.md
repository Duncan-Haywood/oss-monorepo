---
title: "Two downloads, one .part file: a small race in three of our fetch helpers"
seo_title: "Download to a per-process .part file, then rename"
date: 2026-11-15
tags: [process, python, downloads, concurrency, research-tools, open-source]
description: "Three download helpers here wrote to one fixed <name>.part path. Two jobs fetching the same file could crash or rename each other's half-written bytes."
---

The research sessions in this repository often run two jobs side by side: one that downloads the data and one that starts the experiment. Earlier today one of them hit a crash. The water-leak programme's experiment job tried to fetch `L-TOWN_Real.inp` while a parallel fetch job was still writing it, and it raised `FileNotFoundError` ([the run record](../../prompts/runs/2026-11-15-session_01AcxTtKRpXZwaESp855JRCr.json), PR #16040). Nothing was lost that time. The other job finished the file and the experiment read it from the cache. The session's advice to the next run was "start downloads in one job".

That advice works around the problem without fixing it, so this run fixed it.

## What went wrong

The helper downloaded to `<name>.part` and renamed that to `<name>` once the bytes were in. That pattern is right for one process, because a reader never sees a half-written file under the real name. With two processes it breaks, because both use the same `.part` path:

1. Job A opens `L-TOWN_Real.inp.part` and starts writing.
2. Job B opens the same path, which truncates it, and writes as well.
3. A finishes first and renames the file into place. B's rename then finds nothing there and crashes. In the worse order, one job renames a file the other is still writing.

In the water-leak helper the second case was caught, because the file was checked against a recorded SHA-256 before the rename. The other two helpers had no hash to check against.

## Where else it was

A search for a fixed `".part"` suffix turned up the same pattern in two more places:

- `research/_shared/remote_zip.py`, which pulls single files out of a remote zip with HTTP range requests. It checks each file's CRC, but two processes writing one `.part` can still rename the other's half-finished file.
- `platform/audio/narrate.py`, which downloads the speech model the first time it runs. If two episode renders start against an empty models folder, both download into the same `.part` file.

## The fix

Each process now downloads to its own file, `<name>.<pid>.part`, and moves it into place with `os.replace`. That rename is atomic on one filesystem, so whichever job finishes last leaves a complete, checked copy, and neither job touches the other's partial file. A failed download now deletes its own temp file, so the per-process names don't pile up.

Each helper gained a test that leaves another process's half-written `<name>.part` in the folder and checks that the fetch neither uses it nor renames it: `test_fetch_uses_a_per_process_temp_file` for the water-leak data, `test_temp_file_is_per_process` for `remote_zip`, and an updated model-download test for the narrator.

## What it costs and what it doesn't fix

Two jobs fetching the same file still download it twice. That wastes bandwidth but does no harm, and a lock file would cost more code than the waste. The run that hit this lost a few seconds. The point is that the next run doesn't need to remember a rule about starting downloads in one job.
