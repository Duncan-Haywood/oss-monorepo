---
kind: note
subjects: [ci]
date: 2026-11-17
---
# `git fetch --depth` cuts a shallow clone's history (2026-11-17)

For the next run that may edit control-plane files (CODEOWNERS paths), and
for anyone puzzled by tools that read "too little history".

## Finding

In a shallow clone (every cloud session, git 2.43), `git fetch --depth=N
origin <ref>` and `git fetch --shallow-since=<date> origin <ref>` move the
shallow boundary to N commits / <date> behind the fetched tip. When that tip
is on main (any session branch, any PR head), main's own fetched history is
cut there too. Measured this session: HEAD reached 1,091 commits after
`--shallow-since=2026-11-14 origin main`; `--depth=40 origin pull/16981/head`
left 45; `--shallow-since=2026-11-16 origin pull/16970/head` left 373.
Plain fetches and `--shallow-exclude=main` did not cut.

## What landed (PR #16984)

`python3 platform/ci/fetch_ref.py <branch|main|pull/N/head>` fetches without
cutting (see its docstring). `run_workflow_locally.py`'s automatic merge-base
fetch uses it; hints in `run_venture_tests.py`, `slug_dupe.py`, `pick_track.py`
name it.

## Still to do (owner-gated files, not editable from a normal run's branch)

- `CLAUDE.md`, "Duplicate PRs": replace "fetch a branch with
  `git fetch --depth=40 origin <branch>` (without `--depth` it pulls the full
  ~5 GB history)" with "fetch a branch with
  `python3 platform/ci/fetch_ref.py <branch>` (a bare fetch can pull the full
  ~5 GB history; `--depth=40` cuts main's fetched history to 40 commits)".
- `.github/prompts/land-your-work.md`, "Branching from `main`?": replace
  `git fetch --depth=1 origin main` with `python3 platform/ci/fetch_ref.py main`
  (a `--depth=1` fetch of main cuts a deepened clone back to one commit).
- Left alone: `prompt.md` step 0's `--depth=1 origin security-alerts`. That
  branch shares no history with main, so its boundary cuts nothing on main.
