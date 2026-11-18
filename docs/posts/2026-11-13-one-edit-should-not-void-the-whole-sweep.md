---
title: "One edit mid-sweep used to void every workflow; now it voids only the ones it could have touched"
seo_title: "One edit mid-sweep no longer voids every workflow"
date: 2026-11-13
tags: [ci, process, agents]
description: "Our local CI runner threw away a whole sweep when the checkout changed. It now keeps the workflows that finished first and names only the ones to re-run."
---

Before an agent session merges a pull request here, it usually runs `platform/ci/run_workflow_locally.py --for-changes`. That script finds every GitHub Actions workflow the diff would trigger and runs their read-only steps on the session's own machine. A sweep can take several minutes, so the script moves itself to the background after 100 seconds and the session goes on working.

That is the trap. If the session edits a tracked file or commits while the sweep runs, the steps still to run read a different tree from the ones already done. The script spots this: it records HEAD and the content of every tracked file before the sweep and checks them again after. If either changed, it prints `UNSTABLE CHECKOUT` and refuses the whole result, a pass included. A verdict taken across two trees isn't a reading of either one.

The refusal is right. What it cost wasn't. **Eleven run records** in `prompts/runs/` mention a sweep lost this way. Most often the session edited its own run record or committed mid-sweep. One sweep of a stories-only diff ran for over 500 seconds and was thrown out over a single commit. Each of those sessions then re-ran every workflow, including the ones that had finished cleanly before anything moved.

## What changed

The script now takes the fingerprint again after each workflow, not just once at the end. Workflows that finished before the first change are reported as standing verdicts. The workflow during which the tree moved, and every one after it, is reported as void, and the script prints the exact command to re-run just those:

```
  UNSTABLE CHECKOUT: tracked files changed while the sweep ran (HEAD did not move)
  Read on one tree before it moved (these verdicts stand): ventures-tests.yml.
  Void, the tree moved while or before they ran: portfolio-validate.yml. Re-run just those, ...
```

The exit code is still 1. A sweep with a void workflow is not a clean pass, and nothing reads it as one. If the tree moved during the first workflow, nothing stands and the message is the same as before.

The background handoff message now also says what to avoid while you wait: don't edit or commit tracked files until the log's last line reads `DONE`.

## Why it is safe

The rule doesn't loosen anything. A workflow is kept only when the checkout matched its starting fingerprint both before the sweep began and after that workflow ended. Every step of it therefore read the original tree. The rest is unchanged: a move with HEAD still is caught, and so is a fingerprint git can't produce, which is treated as "couldn't measure" and never as "moved". The existing tests for those cases still pass. Two new ones cover a move between workflows (the first verdict stands, only the second is re-run) and a move during the first workflow (nothing stands).

Each fingerprint costs one `git diff HEAD --raw`, under a second here, taken once per workflow until the first move.
