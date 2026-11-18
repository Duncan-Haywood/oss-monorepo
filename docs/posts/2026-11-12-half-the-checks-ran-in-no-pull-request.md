---
title: "Half of the repository's page checks ran in no pull request"
date: 2026-11-12
description: "30 of 60 platform/ci check scripts were in no workflow, so a stray </head> reached main. One script now finds and runs the unwired ones on every venture PR."
tags: [process, ci, checks, platform]
---

This repository has 60 small check scripts in `platform/ci/` named `check_*.py`. Each one looks for one class of defect across the site: a stray closing tag, a duplicate DOM id, a link to an anchor that does not exist, a page title that is too long. Today, half of them never ran on a pull request.

## How it showed up

`main_health.py` runs every argument-free check against `main` in one go. This afternoon it reported 59 of 60 green. The red one was `check_tag_balance.py`: `ventures/pick-path-optimizer/index.html` had a second `</head>` on line 60. The page had come in with PR #15195 two hours earlier, with green CI.

The page's head had a pasted mobile-overflow snippet followed by `</head>`, then the page's own `<style>` block, then the same snippet and `</head>` again. Browsers recover from this, but the check exists because a run once found that a stray tag can swallow a stylesheet.

## Why CI did not catch it

The check was in no workflow. Searching `.github/workflows/` for each script's file name:

```
for f in platform/ci/check_*.py; do grep -rqF "$(basename $f)" .github/workflows/ || basename $f; done
```

That listed 30 of the 60: tag balance, DOM ids, fragment links, insecure references, empty controls, JSON validity, `llms.txt` links, thin pages and 22 others. All 30 pass on `main` today. Run in parallel on a 4-core container, 29 took 0.2 to 12 seconds each; `check_js_syntax.py` took 68 seconds under that load. Someone wrote each one, tested it (most have a `test_check_*.py`) and fixed the tree, but never added the step that runs it on pull requests. Each step needs an edit under `.github/`, which here waits for the owner's approval. So the checks only ran when a session happened to run `main_health.py`.

## The fix

`platform/ci/unwired_checks.py` finds the check scripts that no workflow file names and runs them in parallel. `run_venture_tests.py --since`, the command the ventures-tests workflow already runs on every PR that touches `ventures/`, now runs them as well and fails when one goes red. When someone adds a check and forgets to wire it in, the next venture PR runs it anyway. When a check does get its own workflow step, it drops out of the set without anyone editing a list.

Covering only venture PRs is a known gap. A PR that touches nothing but `docs/posts/` still skips `check_post_links.py`. Closing that gap means editing a workflow, which can come in its own small PR for the owner to approve.

The same run fixed one more silent miss. The photo-editing suite errored in cloud sessions on `from PIL import Image`. The first `python3` on PATH (3.11) was loading a Pillow built for 3.13, while `/usr/bin/python3` imported it fine. The venture test runner already retries a missing module with another interpreter. But it only recognised "No module named", and it tested for the module with `import PIL`, which works even when Pillow is broken. It now treats `cannot import name '_imaging' from 'PIL'` as a broken install and checks candidate interpreters with `import PIL._imaging`.
