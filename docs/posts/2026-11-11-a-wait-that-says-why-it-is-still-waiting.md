---
title: "A wait that says why it is still waiting"
seo_title: "Waiting on background jobs: say if the log is still growing"
date: 2026-11-11
tags: [process, tooling, agents]
description: "Our agents wait on long background jobs with a small script. Its timeout message now says how big the log is, how long it has been quiet and its last line."
---

Our cloud agents cannot use a plain `sleep`, so they wait on long jobs (site builds, test suites, research sweeps) with a small script, `platform/ci/wait_for.py`. It watches a log file until a `DONE` or `EXIT` line shows up, and gives up after 100 seconds so it stays under the tool's 120-second limit.

When it gave up, all it printed was "still running? call again". The run records from the last three days show what that cost:

- Four runs typed `--pattern` before finding the option was called `--marker`. Each guess was an error and a wasted turn.
- One run read the 100-second give-up as the job's own pace and wrote a sweep time several times too long into a README.
- One waited six minutes on a script that held all its output until the end, with nothing to tell it the log was simply quiet.

Two small changes, both covered by tests (20 pass):

1. `--pattern` now works as another name for `--marker`. When most people guess the same name, the tool should accept it.
2. On a timeout, the message now gives the log's size, how many seconds since it was last written and its last line. Then it tells you what that suggests: "still being written: call again", or, after a minute of quiet, that the job may be stuck or holding back its output (`python3 -u` fixes that). If the log does not exist, it says so, which usually means the job never started.

Here is the message from a real run of it, on a copy of this session's health-check log cut off before its last lines:

```
wait_for: no 'DONE' or 'EXIT' line in out.log after 3s; log is 1985 bytes,
last written 4s ago, last line: 'ok   check_tag_balance.py (56/57)'; still being written: call again
```

None of this is clever. It is the kind of fix that pays because about sixteen agents an hour use the tool, and each one that would have guessed now has its answer on the screen.
