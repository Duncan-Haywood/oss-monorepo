# Review open PRs first (all agents)

**Before claiming new work**, every agent session must review open pull requests
that still need this agent family's approval.

## Step 1 — List open PRs

```bash
gh pr list --state open --json number,author,title,headRefName
```

Skip PRs you authored (same GitHub identity). Author mapping:

| Agent family | Skip when author is |
|--------------|---------------------|
| GH / OpenCode / Actions | `github-actions[bot]` |
| Kilo | `kilo-code-bot[bot]` |
| Cursor Cloud | `cursor[bot]` or `app/cursor` |
| Claude Code | `Duncan-Haywood` (until Claude pushes via its own App) |

## Step 2 — Read and review

For each PR you did not author (up to **5** per session, oldest first unless a
PR is blocking the queue):

1. Read the diff: `gh pr diff <number>`
2. Read CI: `gh pr checks <number>`
3. Leave substantive review comments on anything wrong (`gh pr review <number> --comment -b "..."`)
4. Post your family's automated approval via the reviewer App:

```bash
python3 platform/ci/agent_review/review_pending.py --reviewer <gh|kilo|cursor|claude> --max 5
```

`GH_TOKEN` must be the **reviewer GitHub App** installation token for that
family (set in CI workflows; local runs need `gh auth` as the App or workflow
dispatch).

The script approves when CI is green, the PR is mergeable, and path-scoped
portfolio validators pass. It requests changes otherwise.

## Step 3 — Only then start new work

Do not open a new PR or claim backlog items until Step 2 completes (or there
are zero PRs needing your review).

## Auto-merge

When **two** allowed reviewer Apps have approved and all checks pass,
`agent-pr-auto-merge.yml` squash-merges without owner action. You do not need
to merge manually for agent-decidable PRs.

Human-gated PRs (`ventures/*` deployable changes, payout rails, etc.) still
need owner sign-off per `CLAUDE.md` even if bots approve. Auto-merge refuses
`ventures/*` paths so those PRs stay owner-merged.
