# Cutting the deadweight: an audit of this repository's rules

**Date:** 2026-10-20. **Asked by:** the owner, first as a question ("any bizare
rules in this repo I might want to look at to see if I want to revise to
guidelines or remove?"), then as a direction ("cut the deadweight in rules and
processes ... respect the competence of the ai agent engineer"). **Method:** I
read the always-read instruction files, counted them with `wc` and `grep`,
checked each rule against the code and workflows it names, and made the
changes listed below in the same pull request. Counts are from this
checkout. They are not timed runs and not a measurement of agent behaviour.

## The short version

- The instructions a run reads had grown to **183,753 bytes** across twelve
  files (roughly 45k tokens), before any task-specific reading. They grew one
  incident at a time. Almost nothing was ever removed.
- Several rules described a world that no longer exists. Agents were told to
  publish a `gh-pages` branch that is no longer served, to deploy to a Hetzner
  box deleted on 2026-10-01, to push `cursor/` branches whatever their tool,
  and to take work from a `PROJECTS.md` that does not exist.
- One automated gate worked against the owner's own direction. The bot
  auto-merge refused `ventures/*`, while every guide told agents to merge
  `ventures/*` by hand anyway. The owner: "this should get killed. it was a
  stupid thing." It is removed.
- `CLAUDE.md` went from **352 lines to 139** (18,690 to 6,987 bytes). It has
  12 *never/must/do not* words where it had 30, and 4 dates where it had 13.
  Across the twelve files the total is now **170,362 bytes**. The pre-cut text
  is kept for study in
  [`docs/history/rules-before-cut-2026-10-20.md`](../history/rules-before-cut-2026-10-20.md).
- The principle now has a home that binds future edits:
  [`prompts/steering.md`](../../prompts/steering.md), "Cut the deadweight".
  Every review run now cuts at least one rule and names one lesson from
  outside.

## What the rulebook looked like

| File | Lines before | Lines after | *never/must/do not* before | Dates before |
|---|---:|---:|---:|---:|
| `CLAUDE.md` | 352 | 139 | 30 | 13 |
| `AGENTS.md` | 203 | 163 | 14 | 5 |
| `.github/prompts/land-your-work.md` | 173 | 169 | 11 | 4 |
| `.github/prompts/verify-and-merge.md` | 151 | 135 | 10 | 3 |
| `prompts/goals.md` | 491 | 513 | 36 | 22 |
| `prompts/steering.md` | 116 | 124 | 2 | 3 |
| `PRODUCT_PLAYBOOK.md` | 511 | 509 | 42 | 11 |
| `portfolio/DIRECTION.md` | 873 | 873 | 49 | 49 |

`goals.md` and `steering.md` grew on purpose. They now carry the owner's
2026-10-20 words and the new principle. Everything else shrank or held.

Three patterns explain most of the old bulk:

1. **Incident stories inside rules.** "872 of 875 surviving merged-PR
   branches", "two sessions closed each other's PRs 38 seconds apart",
   "measured 2026-10-05: 1,251 merged and 23 closed". Each one is true and
   was worth a commit message. Kept in an always-read file, every run pays
   for it on every read.
2. **The same rule in three places.** The owner-only list, the merge
   permission ("Answered 2026-08-25: yes, agents merge product PRs. Do not
   re-ask", in three files), duplicate-PR handling and CI reading each
   appeared in `CLAUDE.md`, `AGENTS.md` and a `.github/prompts/` file. Copies
   drift: the `gh-pages` instructions were fixed in one file and left in two.
3. **Gates that outlived their reason.** The `ventures/*` auto-merge
   exclusion dated from a time when venture CI was path-filtered and slow. The
   `mergeable_state` check in `platform/ci/agent_review/review.py` now covers
   that risk (a merge before slow checks finish), so the exclusion only
   blocked work.

## What changed in this PR

| Change | Why |
|---|---|
| Removed the `ventures/*` refusal from `merge_eligible` in `platform/ci/agent_review/review.py` | Owner direction. The `mergeable_state` and checks-green gates still apply to every PR, and so does the same-repo gate for forks. |
| Rewrote `CLAUDE.md` judgment-first | It now opens on trust and the hard limits, gives one line per default, links out for procedure, and keeps no incident stories. |
| Cut the duplicated "Ship fast" lists from `AGENTS.md`; dropped the `cursor/` branch rule | Duplicates of `CLAUDE.md`; the branch name is set by each tool's harness. |
| Replaced the post-merge `publish-branch.sh` ritual in `verify-and-merge.md`, `land-your-work.md` and `AGENTS.md` | `portfolio-pages.yml` deploys on every push to `main`. Merging is publishing. |
| Removed the Hetzner deploy path from `ventures/CLAUDE.md` and `PRODUCT_PLAYBOOK.md` | The servers were deleted on 2026-10-01. Services now ship as self-deploys, which is the owner's business model anyway. |
| Removed the "HTTP 500, it succeeded on the third try" line from `prompt.md` | Folklore. `land-your-work.md` keeps the useful version (search for the PR before retrying). |
| Added the owner's 2026-10-20 words to `prompts/goals.md` | "Judgment over rules" and the "every run ships" guardrail now quote them. |
| Added "Cut the deadweight" to `prompts/steering.md`, plus a line in review prompts 1 and 2 | The cut has to recur, or the pile grows back. |
| Lowered `INSTRUCTION_BUDGET` for `CLAUDE.md` (500 to 200) and `AGENTS.md` (250 to 200) | It works as a ratchet: `measure` reports growth against these. |

**Kept on purpose.** These stay: every hard limit (fork PRs, secrets,
licensing, money and accounts, platform terms, research integrity), "every
run ships something useful", and "every session lands its own PR". The owner
reaffirmed the first: "if you think there's nothing worth doing you haven't
looked hard enough or broad enough." The second is "generally directionally
correct" in the owner's words, because it keeps work from piling up on
branches. Both are now stated once, with their reason, and no history.

**Deferred: the red-team share.** `promptctl.py validate` fails CI when the
red-team track's routing weight leaves 5–10%. That makes a sampling ratio a
hard gate. My proposal is to keep it as a reported default instead. Because
it removes a CI failure, it waits for the owner's explicit yes. It is not in
this PR.

## Lessons from elsewhere

The owner asked how organisations at similar or higher throughput handle
this. These are the practices I am confident of and could cite. I did not
survey anyone, so read them as reading, not research.

- **Two-way doors.** Amazon's 2015 shareholder letter splits decisions into
  Type 1 (one-way doors, irreversible) and Type 2 (two-way doors, cheap to
  undo). Type 2 decisions should be made fast by individuals or small groups,
  not run through the heavy process meant for Type 1. In this repository a
  merged PR can be reverted, so nearly all agent work is a two-way door. The
  hard limits are the one-way doors, and that is where rules belong.
- **Rules must pull their weight.** *Software Engineering at Google*
  (Winters, Manshreck and Wright, O'Reilly 2020) gives this as the first
  principle in its chapter on style guides and rules. A rule has a cost for
  everyone who must learn and follow it, so it needs a benefit that justifies
  that cost. The same book's "Beyoncé Rule" ("if you liked it, then you shoulda
  put a test on it") is the other half: what matters goes into a check, not a
  paragraph.
- **Tooling, not prose, at scale.** Potvin and Levenberg (*Communications of
  the ACM*, 2016) describe Google's monorepo taking about 16,000 human and
  24,000 automated changes a day. It holds together through presubmit checks,
  code ownership and automated large-scale changes, not a longer handbook.
  Here the equivalent is to keep the checks that catch real faults and delete
  the paragraphs they replaced.
- **Context, not control.** Netflix's culture writing (Hastings and Meyer,
  *No Rules Rules*, 2020) argues that with high talent density, leaders
  should give context and remove controls, and that rules accumulate to
  protect against the rare mistake at the cost of everyone's speed. A
  capable agent given the goal and the reason needs less procedure.
- **Commander's intent.** Military mission-command doctrine (US Army ADP
  6-0) gives subordinates the purpose and the end state, so they can act
  when the plan breaks. Each default here should carry its reason for the
  same purpose: an agent whose situation the rule did not foresee can still
  serve its intent.
- **Chesterton's fence.** Don't remove a fence until you know why it was put
  up (G. K. Chesterton, *The Thing*, 1929). That is why the pre-cut text is
  archived and why `steering.md` asks the editor to read a rule's history
  before deleting it.

## Candidates for the next cut

I found these and did not act on them, because each needs a closer look than
this run gave it:

- **13 workflow files** under `.github/workflows/` still mention the retired
  cluster's IPs, `HETZNER`, `k3s` or `self-hosted` runners (`grep -lE`). Some
  may be dead weight that still runs.
- **`portfolio/DIRECTION.md`** is 873 lines with 49 dated references. It is
  the largest steering file and mostly history.
- **`PRODUCT_PLAYBOOK.md`** has 42 *never/must/do not* words, the most of any
  file. Its definition-of-done checklist carries incident stories (#4573).
- **`land-your-work.md`** is still over its own budget (169 of 160 lines).
- **The verify checklist** in `verify-and-merge.md` can only grow:
  `checklist_coverage.py` fails when a test directory goes unnamed. Making
  `run_workflow_locally.py --for-changes` the one command, and the list a
  reference, would cut the most reading.

## What this does not show

None of this measures whether agents do better work with fewer rules. The test
is the next few hundred run records. Watch whether `doc_friction` falls,
whether `deviations` find fewer rules to route around, and whether escaped
defects rise now that the venture exclusion is gone. `promptctl.py measure`
reports all three.

This report was written by an AI agent (Claude Code) at the owner's request.
