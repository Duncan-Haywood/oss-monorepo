# Git with 16 agents on one `main`: the defaults, why, and what went wrong

About 16 agent sessions work on this repository at once and merge about 280
PRs a day to `main` (2026-10-17 to 10-20). This file covers how to use git
safely at that rate. [`land-your-work.md`](land-your-work.md) gives the
landing steps; this file explains why each default exists. The measurements are
in [`docs/parallel-agents.md`](../../docs/parallel-agents.md). The public
write-ups are `docs/posts/2026-10-20-one-branch-per-agent-280-merges-a-day.md`
and `docs/posts/2026-10-20-what-went-wrong-sixteen-agents-one-main.md`.

## The pattern, and why we keep it

One short-lived branch per session, a PR opened on the first push, a squash
merge by the session itself once CI is green, and fixes made forward rather
than by reverting. Measured 2026-10-17 to 10-20 over 1,111 PRs: the median PR
touches 6 files and lands 1 minute after its last commit. Only 22% of PRs had
to merge `main` back in, and 20% of commits are conflict overhead. The
alternatives below were weighed against those numbers, and none of them
beats the pattern on its own.

## Defaults, with their reasons

1. **Avoid adding a file that every PR has to edit.** A counter of the whole
   tree, a list of every project, or a generated mirror makes any two
   concurrent PRs conflict. Put per-item data in the item's own directory and
   derive the totals. *Why:* in early October 95% of PRs rewrote one
   generated mirror (about 2,700 files) and 53% of all commits were conflict
   overhead. Removing it took the median PR from 2,339 files to 6. To check
   your change, run `concurrency_tax.py`, or the method in
   `docs/parallel-agents.md` (P041 makes the script work in cloud sessions).
2. **Keep generated output that nothing serves out of git.** Build it
   when you deploy. *Why:* the mirror for the server retired on 2026-10-01
   stayed in every PR for about two more weeks. It came back once (6,202
   files) before #8638 removed it and added a check that fails if it returns.
3. **A CI check on `main` compares a commit with its own parent
   (`github.event.before`), not with `main`'s current tip.** *Why:* a
   queued run starts about 10 merges late, so the tip has moved. 77 of 100
   `Portfolio validate` runs on `main` failed because a venture added after
   the commit looked as if the commit had deleted it. A pull-request run
   has the same race: compare its test merge with that merge's first
   parent. #8765 fixed both in `Portfolio validate`. Review new workflow
   steps for "fetch `main`".
4. **A red `main` is fixed or removed the same day.** *Why:* `Portfolio
   validate` stayed red for 1,000+ runs from 2026-09-29. Agents learned to
   merge on red, and #7226 broke `gitops/tests` behind it. If a red check
   looks "already broken", classify it (`ci_starvation.py`). Then reproduce
   it on the commit itself before you merge on top of it.
5. **Avoid letting `main` runs cancel each other.** Use `cancel-in-progress`
   only on PR branches. *Why:* 44 of 100 `ventures tests` runs on `main` were
   cancelled by the next merge, so most commits never got a verdict (P038).
6. **Squash-merge.** Merge `main` into your branch to resolve a conflict;
   avoid rebasing or force-pushing a branch that is not yours. *Why:* squash keeps
   `main`'s first-parent history one commit per PR, which every measurement
   here depends on. From 10-14 to 10-16, 228 PRs landed as merge commits and
   brought their internal merge-main commits onto `main`. The research
   mirror merge is the one exception (`prompt.md`).
7. **Open the PR on your first push.** *Why:* on 2026-10-05, 100 branches with
   186 commits had no PR, and every guard here runs on a PR or on `main`.
8. **Your turn can end before CI does. Say so plainly.** When CI is queued,
   report "pushed, CI queued, not merged". Keep the PR subscribed and set a
   check-in. *Why:* on 2026-10-20 a session reported a finished report while
   its PR was still waiting for runners, and the owner had to ask whether it
   had merged.

## What went wrong, in order

| When | What | Cost | Fixed by |
|---|---|---|---|
| 09-05 to 09-16 | Tree counts pinned in tests and docs (`total = N`) | every venture PR edits them; `sync_tree_counts.py` patches the symptom | open: derive them (docs/parallel-agents.md fix 2) |
| 09-07 | A stale working tree committed on a new parent deleted a whole venture (#3740) | a shipped product removed with green CI | `check_venture_regression.py` |
| 09-29 to 10-16 | `Portfolio validate` red on every push (score coverage) | 1,000+ red runs; real breaks hid behind it | #7240 and later; rule 4 |
| 10-01 to ~10-14 | Dead origin's mirror regenerated in every PR | 53% of commits were overhead; median PR 2,339 files | P024, #8638; rule 2 |
| 10-05 | 100 branches never got a PR | four finished ventures not on `main` | `unlanded_work.py`; rule 7 |
| 10-19 | Mirror tree came back (6,202 files) | one more removal round | #8638 guard |
| to 10-20 | Regression check compared each push with a later `main` tip | 77% of `main` validate runs falsely red | #8765; rule 3 |
| to 10-20 | `main` test runs cancelled by the next merge | 44% of `main` runs gave no verdict | P038; rule 5 |
| 10-20 | #8723 added a `feedback/` page that `check.mjs` treated as a product; the Pages build failed and nothing deployed after 08:48 | every merged post and page waited, unpublished | `feedback/` made a site-own directory and given share tags (#8752; the same fix was also drafted in #8779 and #8765) |
| 10-20 | `concurrency_tax.py` timed out in a cloud session | the measurement had to be rebuilt by hand | P041 |

## Alternatives we weighed (2026-10-20)

| Alternative | Verdict | Why |
|---|---|---|
| Push straight to `main`, no PRs | no | Every guard here (CI, `unlanded_work.py`, cross-review) runs on a PR. Orphaned branches show what happens without that anchor. |
| A long-lived integration branch batched to `main` | no | Adds a second place to conflict and a second merge for every change. Overhead is 20% and falling, so there is nothing to batch away. |
| Stacked PRs | rarely | They help a chain of dependent changes from one author. Here PRs are independent and small (median 6 files). |
| Rebase instead of merging `main` in | no | It rewrites other sessions' branches and fails with stale tracking refs (`land-your-work.md`). Squash already gives a linear `main`. |
| Locks or claims on shared files | only for new slugs | A lock held by a session that dies goes stale, and sessions die often. Removing the shared file (rule 1) works better. |
| Split into several repositories | no | The hotspots were generated files and registries, not repository boundaries. Splitting would lose the shared tooling and checks. |
| GitHub merge queue with batching | **yes, next** | 66% of PRs merged on a `main` they were not tested against (median 1 commit behind). A queue closes that gap. Turn it on after rules 3 and 5 hold, so the queue's CI tells the truth (P042, owner setting). |

## Open work

Backlog items in `prompts/process/backlog/`, each with steps, a metric and a
baseline: **P037** (verify #8765 on `main`), **P038** (do not cancel `main`
runs), **P039** (skip the dead-mirror check), **P040** (research registry
hotspot), **P041** (`concurrency_tax.py` in the cloud), **P042** (merge
queue, owner).
