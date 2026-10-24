# Triage of the 38 adopted drafts of 2026-10-16/17

**Date:** 2026-10-24. **PR:** 10022. **Found in:**
`docs/reports/2026-10-24-pr-review-without-dead-branches.md`, section 1.

## Where they came from

The brief described them as N sibling drafts per task from a fan-out
dispatcher. They were not: every one is titled "Adopt stranded branch ..." and
was opened by `.github/workflows/adopt-stranded-branches.yml`
(`platform/ci/adopt_stranded.py`). That job gives a draft PR to each branch a
session pushed and then left, at most 10 per run. Four of its runs on
2026-10-16/17 opened 38 of them. The `claude/<adjective>-<scientist>-<suffix>`
names are cloud session names, and one slug prefix (`zen-ramanujan-*`) covers
unrelated tasks. Two pairs were real siblings, though, two stranded attempts at
the same page:

- 7400 and 7467: `actions-permissions-check` comparison page;
- 7401 and 7549: `pool-plaster-bid-calculator` comparison page.

Nothing ever closed an adopted draft. Once a branch has a PR, the adopter no
longer sees it as stranded, so a draft stayed open until a session read it. No
session did for a week.

## How each was checked

The local clone's shallow history could not compute merge-bases with the
2026-09/10 branches (`git fetch --shallow-since` failed with `error in object:
unshallow`). So the check ran in a separate treeless probe repository, the way
`adopt_stranded.py` itself works. For each PR it took the authored
(non-derived) files changed since the fork and three-way-classified them with
`adopt_stranded.classify_paths`: landed (matches main), unlanded (only the
branch changed it) or contested (main changed it too). For every unlanded file
I then looked at main for the same work under another name:
`surface-budget.mjs --for <slug>`, the venture's `vs-*.html` pages, the slug
on main, and for pages, whether the copy still matches main's tool.
`supersede_check.py` was tried on 7299 and timed out after 300 s on the
treeless probe (its line scan reads the whole base tree), so it was not used
per PR. This is listed under `deviations` in the run record.

## Outcome

| PR | branch work | decision |
|---|---|---|
| 7296 | `research/homebot`: 22-DOF printable robot, MuJoCo twin, RL results (24 commits, 165 files) | **landed** in PR 10022 (project.json, theme `twins`); tests 69 passed, 2 skipped (render needs GL) |
| 7546 | `dns-configuration-evidence/vs-checking-dns-by-hand.html` | **landed** in PR 10022; the venture had no generic-method page; 47 tests and the clause check pass |
| 7295 | axe-throwing venue venture | closed: shipped as `axe-throwing-bar-profit-calculator` |
| 7297, 7392-7395 | per-venture CI workflow (venture already on main) | closed: `ventures-tests.yml` covers every venture |
| 7298 | agent-run harvest | closed: its README says "private on purpose" (full prompt text); not for this public main |
| 7299, 7301, 7302, 7304 | comparison pages / links | closed: main has rewritten every file (the only 4 `--reap` would close) |
| 7300, 7303, 7397, 7399, 7463, 7465, 7470, 7548, 7550-7552, 7649 | a generic-method comparison page | closed: main has a same-angle page under another filename |
| 7400/7467, 7401/7549 | sibling comparison pages | closed: main has the same-angle page |
| 7464, 7471, 7651 | another generic-method page | closed: main has one and the venture is at its budget |
| 7396 | IndexNow ledger record | closed: ledger-only, main rewrote the code it touched |
| 7398 | recipe-costing comparison page + CI workflows | closed: the page describes an earlier single-recipe tool (no sub-recipes); main's tool has them |
| 7466 | forestry page test | closed: the page itself is on main |
| 7468 | Patreon "$1 tier" guide | closed: says Standard-plan pages pay the micropayment rate; main's `calc.mjs` says legacy plans only |
| 7469 | s-corp usage scaffolding | closed: main has tracking inline in `index.html` |
| 7472 | plantation-shutter `vs-housecall-pro.html` | closed: the copy tells readers the pricing page "is not reachable from this session" |

Each closed PR carries a one-line comment with that reason. 7296 and 7546
close after PR 10022 merges.

## The fix to the job

`adopt_stranded.py` now:

1. **opens one draft per area.** An area is a venture or research directory,
   and it applies when all of a branch's unlanded files sit in one. The
   newest tip wins, the others are skipped with a line naming the winner,
   and the winner's PR body lists them to compare. An open adopted draft
   counts as a claim on its area, so a later run does not open a sibling.
   This would have stopped both pairs above.
2. **`--reap`** (on in the workflow): closes an open adopted draft once the
   rule that would skip it today holds, meaning none of its authored files
   is still unlanded. Each file matches main, or main has rewritten it. The
   comment names the PR that last changed the first such file on main. It
   never touches a draft someone pushed to after adoption or marked ready,
   and it closes at most 40 per run.

Run against today's 38, `--reap` would have closed 4 (7299, 7301, 7302,
7304). The other 32 closes took reading: a same-angle page under a new
filename, a slug renamed, copy that no longer matches the tool. The rule
leaves that to a session on purpose, because a filename-blind close would
also close real work. The one-per-area rule is what stops the backlog
forming.

## For the owner

`claude/agent-run-harvest` (PR 7298) is in this public repository. Its README
says the files hold full prompt and result text and were meant to be private.
A pattern scan for common token formats (GitHub, Anthropic, OpenAI-style,
AWS, Slack, private keys) found none. That is not a full secret scan, and the
prompt text itself is what was meant to stay private. The branch,
and `refs/pull/7298/head`, which GitHub keeps after the branch is deleted, are
public. `branch-cleanup.yml` will delete the branch 24 h after the close.
Removing the PR ref needs GitHub support.

## Verification

```
(cd platform/ci && python3 -m unittest test_adopt_stranded)   # 37 tests OK (10 new)
python3 platform/ci/validate_workflows.py                     # all 548 valid
python3 platform/ci/publish_surface.py --check                # matches
(cd research/homebot && MUJOCO_GL=disable python3 -m pytest -q)  # 69 passed, 2 skipped
python3 research/_homepage/build.py                           # ok: 1049 projects
python3 research/_shared/programme_check.py                   # ok
python3 platform/ci/check_md_links.py                         # ok
node platform/pages/clauses.mjs dns-configuration-evidence    # 4 pages carry their clauses
(cd ventures/dns-configuration-evidence && node --test '*.test.mjs')  # 47 pass
```

## Fixes to main that this PR carries

CI on this PR was red for reasons that were already red on `main`. Both are
fixed here:

- **Seven blog post descriptions over the 160-character cap**
  (`platform/pages/writing.mjs` throws, which fails Portfolio Pages build and
  test on every PR). They kept arriving while this PR was open: four on the
  first merge of `main`, three more over the next hour, plus this PR's own
  post. Each was trimmed without changing its claim.
- **`distribute-shorts.yml`** (PR 9977) runs `python3` without an
  `actions/setup-python` step, which fails
  `gitops/tests/test_ci_runner.py::test_every_job_that_runs_python_or_node_sets_it_up`.
  The pinned `setup-python` step that other workflows use is added.

The over-cap posts point to a gap: the cap is checked only by a slow build
that posts merge ahead of. A quick check on `docs/posts/**` would catch them
at the PR.
