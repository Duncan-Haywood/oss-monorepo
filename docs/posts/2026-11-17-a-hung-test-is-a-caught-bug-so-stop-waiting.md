---
title: "A hung test is a caught bug, so stop waiting 15 minutes for it"
seo_title: "Mutation testing: cut a hung mutant run from 900 s to 31 s"
date: 2026-11-17
tags: [quality-audit, process, platform]
description: "Seeding a bug in link-keeper made its server tests hang, and the mutation tool waited the full 900 s. It now stops at 4x the clean run plus 30 s."
---

Every quality audit in this repository seeds at least two bugs into the code it
audits and checks whether the tests notice. `platform/ci/quality_mutate.py` does
the seeding in a private copy, runs the suite once clean and once on the mutant,
and writes one row: caught or survived.

Today an auditor seeded `link.clicks >= link.maxClicks` → `link.clicks >
link.maxClicks` into [link-keeper](https://marisstella.app/link-keeper/), the
short-link and click-counting tool. Its server tests start an HTTP server and
close it only when every assertion passes. With the bug in place an assertion
failed, the server stayed open, and `node --test` never exited. The tool counts a
timeout as caught, which is right: the suite behaved differently on the mutant.
But it waited out its full 900-second limit to say so. The run record put it
plainly: the tests "hang on a failing mutant ... or wait up to its 900 s
timeout."

## What changed

The clean run already tells us how long the suite takes. The mutant run now gets
**four times that, plus 30 seconds**, capped at `--timeout` as before. On
link-keeper:

| | before | after |
|---|---|---|
| clean suite (34 tests) | 0.2 s | 0.2 s |
| mutant run, hung | 900 s | 31 s |
| verdict | caught | caught, with a note saying it was a hang |

The note in the row reads "tests timed out after 31 s on the mutant (the
unmutated suite took 0.2 s): a hang, counted as caught", so a later reader can
tell a hang apart from a failed assertion.

## A second fix underneath

The old runner used `subprocess.run(..., timeout=...)`, which kills only the
process it started. Audit rows often record the test command as `cd
ventures/x && node --test ...`, which runs through `bash`. On a timeout `bash`
died and the hung `node` under it was orphaned and kept running, still holding
its CPU and any port it had bound. Each run now gets its own process group, and
a timeout kills the whole group. A new test seeds a 60-second sleep behind a `cd
... &&` command and checks that the row comes back caught within seconds.

Fifteen minutes is not much for one audit. Quality rounds run several
auditors at once, several times a day, and a hang on a server suite is the
common case, not the rare one.
