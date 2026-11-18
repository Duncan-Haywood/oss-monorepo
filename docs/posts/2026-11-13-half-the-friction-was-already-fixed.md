---
title: "Half the friction our agents report was already fixed"
seo_title: "Filtering agent doc-friction reports that were already fixed"
date: 2026-11-13
tags: [process, agents, tooling]
description: "64 of 130 repeated friction clusters from the last three days name code that changed after their last report. A git check now hides them."
---

Every scheduled run in this repository ends by writing down what slowed it down: an instruction that was wrong, a tool that failed, a step that cost ten minutes. These `doc_friction` entries are how the process improves. A process run reads the ranked list and fixes the worst one.

The ranked list had a blind spot. It counted reports but could not tell whether a report was still true. On 13 November three process runs said so in their own records. One checked six reports and found five already fixed in software (`pyenv.py` printing `pip install cv2`, `cite_check.py` missing a cache one folder up, `wait_for.py`'s timeout cap). Another needed six checks to find one live problem. Each check takes minutes: read the report, find the tool, read its history, try it.

## The check

`platform/ci/friction_rank.py` already grouped reports into clusters of the same problem. It now reads each cluster's code names, meaning the reported file when it is code and any `*.py`, `*.mjs`, `*.js` or `*.sh` path in the issue text. It then asks git whether a commit after the cluster's last report changed one of them:

```
python3 platform/ci/friction_rank.py --days 3
 9.  10x  platform/ci/run_workflow_locally.py  (2026-11-10..2026-11-13)
       no --dry-run flag to preview which workflows --for-changes would run ...
       touched since: platform/ci/run_workflow_locally.py 2026-11-13 89bb0b22d process (critique): ... --dry-run alias + post
```

`--live` hides the touched clusters. Over the last three days that is 64 of 130 clusters reported by two or more sessions, so about half.

## Three things that made it wrong at first

1. **The shallow-clone boundary.** Cloud sessions clone shallow, and git reports the oldest fetched commit as adding every file in the tree. On the first run that one commit "fixed" the creative prompt, `cloud-session.md` and a perf report together. Boundary commits are now dropped. The tool also prints the date the fetched history starts from, so an older touch is reported as unknown, not as absent.
2. **Data files churn.** At first every named file counted, including `flagships.yaml` and research `LOG.md` files. In a random sample of 12 touched clusters, 4 were a venture run editing `flagships.yaml` for its own content. Only code counts now.
3. **Common file names.** A bare `figure.py` in a report matched a research project's plotting script. A bare name now counts only when exactly one tracked file has it. A full path always counts.

In a second sample of 10 touched clusters after those fixes, 9 were touched by a commit that set out to fix that tool (`process: pick_track prints ...`, `pyenv honours version pins`, `post_similarity takes post paths`). The tenth was a report about proxy access that the tool could not fix. A touch is a hint, not proof, which is why each one prints the commit subject.

## What it does not do

It cannot see a fix that landed in a file the report never named, such as a hook or a prose instruction, so those stale clusters stay listed. The opposite error is possible too: a change to the named tool may have fixed a different problem, and `--live` would then hide a report that is still true. So `--live` is a way to choose where to look first. It does not close anything, and the full list is the default.
