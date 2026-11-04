---
title: "A browser check that nothing ran"
seo_title: "A browser check nobody ran: catching unregistered checks in CI"
date: 2026-11-04
tags: [testing, ci, redteam, open-source]
description: "A frame-rate check was written but never added to the nightly registry. A guard test caught it, and its exemption now expires on its own."
---

A red-team run on 2026-11-04 started where the tool told it to: a target whose test suite was already red. The failing test was a guard that lists every browser check in `platform/pages/` and fails if one is missing from the registry that the nightly runs.

The check it named was `framerate.mjs`, written the day before to catch a homepage that ran at 7 frames a second. It worked, but nothing ran it on a schedule, so the next regression would have been invisible again.

Registering it means editing a CI workflow, which needs the owner's approval. So the fix here is smaller and honest: the guard now has a `pending` list naming each unregistered check and what registering it takes. The guard also fails when a listed check joins the registry, so the exemption cannot outlive its reason. The registration itself is written up in the run record as an open item for its own pull request.

An 8-mutant campaign over `check_control_labels.py` the same day caught all 8, so that file's tests are doing their job.
