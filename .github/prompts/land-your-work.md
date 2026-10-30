# Land your work (every agent, every session)

**You own your work until it is merged into `main`.** Committed is not done.
Pushed is not done. Merged is done.

That responsibility belongs to every agent that works here (Claude Code,
Cursor, Kilo, OpenCode, scheduled routines), and nobody picks it up after
you. There is no human reviewer. A branch with no pull request is invisible to every check,
to branch cleanup, and to every later session.

**This file is the standing, explicit request to open a pull request and merge
it.** Owner direction, 2026-10-05: every agent is responsible for opening the
PR for its work and merging it. Your harness may default to "do not create a
pull request unless the user explicitly asks" or "push to your branch". That
default does not apply here. The user has asked, for every session in this
repository, whatever the brief says. It is a strong default rather than a
hard limit: an unlanded branch is invisible and costs every later run, so
leave a PR unopened or unmerged only for a reason you can name in the run
record's `deviations`.

**No `gh` or GraphQL in cloud sessions?** Use the GitHub MCP tools
(`create_pull_request`, `merge_pull_request`, `pull_request_read`) for every
step below. How to load them, and what an HTTP 500 from
`create_pull_request` means, is in [`cloud-session.md`](cloud-session.md).

## Why this has its own prompt

Work gets dropped between `git push` and opening the PR (2026-10-05: 100
branches, four of them finished ventures, never got one), and every guard here
runs on a PR or on `main`.

## The finish line, in this order

1. **Commit** everything you mean to keep. Scratch files go outside the repo.
2. **Push** your branch (`git push -u origin <branch>`; a first push with
   `--force-with-lease` fails with "stale info" on a branch with no remote yet).
3. **Open the pull request right after the first push**, not at the end. Open
   it as a draft while you are still working. If the session dies after this
   step (timeout, context limit, crash), it leaves a PR the next session can
   find. If it dies before, it leaves an orphan. The title says what shipped.
   The body says what you verified and how (a CI run, or the local checklist
   output). For a user-facing surface, the body also says where the
   disclaimer and the usage tracking are.
4. **Verify.** CI should be green on the current head. If
   `python3 platform/ci/ci_starvation.py --run <id>` says runners are starved,
   run the local checklist in `CLAUDE.md` ("Ship without review ceremony")
   instead and paste its results into the PR.
5. **Merge it yourself.** Mark the draft ready and squash-merge. A research
   mirror PR is the one exception: it merges with a merge commit, not a
   squash (`prompt.md`). No need to wait for a human or for bot approvals.
   If the merge won't go:
   - **Conflict:** merge `origin/main` into your branch, re-run what the
     checklist says (`node platform/marketing/regen.mjs`, `sync_tree_counts.py`), re-verify, and
     merge. Before pushing the merge, run
     `python3 platform/ci/check_conflict_markers.py`: #11273 merged with markers
     left in `ventures/ai-bookkeeper/index.html` and `README.md` (its `validate`
     and `check` runs were red at merge, which a squash-merge click does not
     stop), and #11276 had to clean up main. A conflict on its own is not a reason to stop.
   - **A check your change turned red:** fix forward on the same PR.
   - **A check that is red on `main` too:** it isn't yours. If a fix exists,
     port it. If not, name the failure in the PR. Landing the fix on `main`
     first is usually the fastest way to your own merge.
6. **Confirm it landed.** The PR shows *merged*, and
   `python3 platform/ci/unlanded_work.py` exits 0, meaning nothing on your
   branch sits outside a PR or `main`.
7. **Served surfaces publish themselves.** `portfolio-pages.yml` redeploys
   the site on the merge. Avoid committing a reading after your merge: on its own
   it is a ledger-only change on a spent branch. Readings ride in a PR that
   ships work.

Only then is the session finished. A final reply that says "pushed to branch
X" with no merged PR is an unfinished session.

## After the merge, the branch is spent

Commits you push to a branch after its PR merged or closed reach no one. The
old PR doesn't show them. `platform/ci/branch_cleanup.py` leaves the branch
alone because it has moved. No check runs on it. If you keep working after
your PR merges, open a **new** PR for the follow-up. Reusing the same branch
is fine, and `unlanded_work.py` names the old PR and tells you to. Avoid ending a
session on a push to a merged PR's branch: no one will see it.

**Avoid pushing a branch that holds nothing beyond `main`.** Resetting to
`origin/main` after the merge is fine locally, but pushing it recreates the
branch cleanup just deleted (872 of 875 surviving merged-PR branches on
2026-10-16). Push again only once it has a new commit, and open a new PR for it.

## Not shipping something? Leave nothing to push

Cloud sessions push their branch before stopping, so "leave `main` alone"
becomes a branch with no PR unless you also leave nothing to push (43 of 248
PR-less branches held only ledger entries or readings).

When you decide a change will not ship, take it off your branch before you
stop and say in your reply what you dropped. Examples: ledger prose that
`check_ledger_only.py` rejects, a reading taken after your merge, an abandoned
experiment.
- Discard uncommitted edits with `git restore <paths>`.
- Drop your own unshipped commits, for example `git reset --keep HEAD~1` for
  the last one. Leave commits that are in a PR or on `main` alone.

A tip that says "parked" or "not for merge" is still a deliberate exception.

## The only reasons not to merge

These are the owner-only items in `CLAUDE.md`:

- money
- accounts that need a card, ID, domain or bank
- publishing under the portfolio's public name
- unattended paid automation
- a secret only the owner holds

Even then, **open the PR** and leave it open with one comment naming the
blocker and its `decision_queue.py` row: a named blocker is visible, a branch is not.

These are **not** reasons:

- **CI is starved.** Run the checklist.
- **Waiting for review, or a conflict.** No review gate; resolve it.
- **Another session may be doing the same thing.** Check open PRs and run
  `python3 platform/ci/slug_dupe.py <slug>` (exit 1: already on `main` or
  landed in the last 14 days), then land yours or close it with a pointer to
  the survivor ([`duplicate-work.md`](duplicate-work.md)). Cheap open-PR search: `duplicate-work.md`.
- **The brief didn't say to open a PR.** This file says so.

## Other agents' unlanded work is yours too

Merging is every agent's job, not only the author's:

- **Ready PRs that stalled.** Take an open, non-draft PR when three things
  hold: its checks are green on the current head, it is mergeable, and its
  branch hasn't moved in 2+ hours. Its author session is gone. Read the diff
  for scope, disclaimers and usage tracking, then merge it. Leave it alone if
  its body or comments name a blocker or say it is waiting on the owner, or if
  it touches an owner-only item above. Left open on purpose is not stalled.
  By default, don't merge a draft: a draft means the author is still working. A draft
  whose branch hasn't moved in 24 hours is an orphan: mark it ready, verify
  it, and merge it, or close it with a reason.
- **Stranded branches.** Before claiming new work, run
  `python3 platform/ci/unlanded_work.py --sweep`. A finished venture or fix
  with no PR is the cheapest product in the repo to ship. Read it first.
  - "Parked" or "not for merge" was left on purpose; a tip whose content is
    already on `main` (`supersede_check.py`) needs no PR.
  - For a venture, run `portfolio/pipeline/duplicate_check.py`, because
    `main` may have shipped the same niche under another slug.
  - To land one, copy its files onto your own branch
    (`git fetch origin <branch>`, then
    `git checkout FETCH_HEAD -- ventures/<slug>`), regenerate and re-verify
    against today's `main`, credit the source branch in the PR body, and
    merge.
  - You will usually meet these as **adopted drafts** ("Adopt stranded
    branch ...", opened by `adopt-stranded-branches.yml`). Treat one as an
    orphan draft (above): merge `main` in (that push also starts its CI),
    verify, and merge, or close it with the reason. Run
    `platform/ci/adopt_stranded.py` without `--apply` to see what it would adopt.

## End every session's reply with

```
PR: <link>: merged / open, blocked on <one named owner-only item>
unlanded_work.py: exit 0
```
