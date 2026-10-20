# How work gets allocated here, and what a better system would change

**Date:** 2026-10-20. **Asked by:** the owner ("i think it makes sense to have
a more advanced or capable work allocating or project management system within
the repo. can you analyze usage and give a suggestion about improvements").
**Method:** read-only. Every count below comes from the 1,572 run records in
`prompts/runs/` (1,287 written here, 285 imported from the archived research
repo), the doc-friction and deviation entries inside them, the `ventures/`
tree, and timed runs of `allocate.py` and `session_gate.py` in a fresh cloud
session. Where something could not be measured, it says so.

> **Correction (same day):** two claims below were wrong. The "9 runs" on
> "project-pages figures" split 29 different projects with no overlap, and
> `prompts/derive.py` already measures `merged` for 1,242 records. See
> [`2026-10-20-agent-tooling-judgment.md`](2026-10-20-agent-tooling-judgment.md),
> which also hands work ranking back to judgment instead of the scored queue
> proposed here.

## The short version

- **The fleet is large and parallel.** About 250–290 runs a day since
  2026-10-15, with up to 9 sessions committing to `main` in one 15-minute
  window (`session_gate.py`, today). About 90% start from the same sentence ("read
  ./prompt.md and follow the instructions there"), so allocation happens
  inside the run.
- **No one system allocates work.** A run consults up to six separate queues
  and chooses between them by judgment. They are `promptctl.py route` (track),
  `session_gate.py` (regime), `allocate.py` (venture),
  `prompts/process/backlog/`, `research/PROJECTS.md` with `pick_track.py`, and
  `unlanded_work.py` / stranded branches.
- **The ranking has nothing to rank on.** All 458 usage entries read
  `live_url_visitors: null`. Merit scores exist for 11 of 1,301 ventures. The
  top 22 rows of `allocate.py` today are identical ("Explore: no hypothesis
  recorded", merit `-`), so the order among them carries no information.
- **Runs route around the allocators.** The allocation tools are the
  3rd–10th most-complained-about files in the friction logs:
  `research/PROJECTS.md` 182, `allocate.py` 70, `session_gate.py` 40. The
  most common complaints are that the top row is already done, the tool is
  too slow, or the advice is obsolete.
- **Nothing reserves work.** No claim or lease exists. Duplicates are caught
  only at push time (backlog item P002), and the 2026-10-16 "project-pages
  figures" task was taken by 9 runs in one day.
- **Effort can't be attributed.** 76% of native records (974 of 1,287) list
  no `projects`, and `merged` is null in 96% (1,503 of 1,572). 94% grade
  themselves `success`, so the outcome field does not tell runs apart.

The fix is not a heavier project-management tool. The fix is **one generated
work queue with claims, fed by signals the repo can actually measure.** The
rest of this report gives the evidence, then the proposal.

## Evidence

### 1. Volume, concurrency and mix

| Day | Run records |
|---|---|
| 2026-10-15 | 261 |
| 2026-10-16 | 253 |
| 2026-10-17 | 231 |
| 2026-10-18 | 285 |
| 2026-10-19 | 288 |

The observed track mix (native records) is close to `prompts/routing.json`:

| Track | Share of runs | Weight in `routing.json` | Median API-equivalent $ / run | Runs with cost measured |
|---|---|---|---|---|
| ventures | 34.6% | 39% | 0.64 | 233 |
| research | 33.7% | 39% | 0.85 | 348 |
| process | 12.0% | 10% | 0.45 | 97 |
| redteam | 9.6% | 7% | 0.40 | 80 |
| explore | 6.1% | 5% | 0.59 | 45 |
| review | 4.0% | review cadence | 0.45 | 23 |

Total measured API-equivalent spend is about $700 over the 826 records with a
`usage` block; the other records carry no cost. So the *track* split works as
designed. Allocation breaks down one level lower: *which item* inside a track.

### 2. Six queues, chosen between by prose

A generic run reads, in some order: the track draw from `promptctl.py route`,
then the verdict and up to five bulleted instructions from `session_gate.py`
(today: PROCEED, with a 1,000-word paragraph on Pages, deploy-first, the
calculator glut and concurrency), then `allocate.py`'s venture table, then the
process backlog (35 items), research `PROJECTS.md` plus `pick_track.py`, and
the stranded-work checks. Each of these has its own idea of "next". None of
them knows what the others recommend, or what the eight other sessions running
right now picked.

The notes and task text of the records show where runs actually got their
work. "gate" is mentioned 75 times, "backlog" 64, "stranded" 17, "allocate" 16,
"PROJECTS.md" 10, "pick_track" 5. Most records don't say at all.

### 3. The router's signal is flat

`allocate.py` ranks 1,300 ventures by merit, ledger outcomes, mentions and
7-day commits. In practice:

- `portfolio/usage/usage.yaml`: 458 entries, every `live_url_visitors` is
  `null`. The README says so honestly ("read by humans and sessions, not yet by
  `allocate.py`").
- `portfolio/scoring/venture-scores.yaml` scores the eleven ventures of
  2026-08-20; the other 1,290 have no merit.
- Today's top 22 rows are all prototype `*-check` tools with merit `-`, cap 0,
  ledger 0, mentions 0, 1–2 commits, and the same task text. The ranking among
  them is effectively alphabetical.

`docs/reports/2026-10-16-calculator-glut.md` already showed what happens when
the deciding code has no outcome signal. Sessions take the cheapest path that
satisfies the prose, and 1,261 near-identical ventures were the result.

### 4. Runs route around the allocators

Doc-friction entries per file (all records, top 10):

| File | Friction entries |
|---|---|
| `CLAUDE.md` | 198 |
| `research/PROJECTS.md` | 182 |
| `research/CLAUDE.md` | 119 |
| `prompts/process/prompt-1.md` | 72 |
| `portfolio/router/allocate.py` | 70 |
| `prompts/ventures/prompt-1.md` | 59 |
| `prompts/research/prompt-0.md` | 45 |
| `prompt.md` | 43 |
| `prompts/review/prompt-1.md` | 41 |
| `portfolio/ledger/session_gate.py` | 40 |

What they say, quoted from the records:

- **The top row is already done.** "Top Explore row (where-to-sell handoff
  hypothesis) was already fully built and browser-verified for all 16
  channels; the row gives no signal that the feature exists." The router has
  no `done` state per task, only per hypothesis.
- **Too slow.** "takes over 120s in a shallow clone (fetches main for 7-day
  counts); had to background it". Timed today, `allocate.py` took 62 s, almost
  all of it a `git fetch` that still timed out ("7-day commit counts are
  partial"). `session_gate.py` took 5.6 s.
- **Obsolete advice.** Most `session_gate.py` complaints are about its
  "refresh the published snapshot" instruction (`publish-branch.sh`, 10+ min,
  needs an unshallowed clone). Since 2026-10-20 the Pages source is GitHub
  Actions and that branch is no longer served (`CLAUDE.md`, "Hosting"), yet
  the gate still prints the instruction first.
- **Research draws land on spent chains.** "Track 1 (selfrep) draw landed on a
  chain of ~50 micro-variants; had to pick a different track by judgment",
  and "Track 3 milestones all done ... had to invent a new question (no queue
  for that case)."

The 208 recorded deviations tell the same story. A typical one: "Skipped the
top-ranked rows (handoff already built; consolidation already done) and
shipped self-host files for the consolidated engine instead." The allocator's
output is advice that runs often override, and the override isn't fed back.

### 5. No reservation, so overlap is found late

Nothing marks an item as taken. The duplicate defences are a pre-PR search
for open PRs (`CLAUDE.md`, "Duplicate PRs") and `platform/ci/slug_dupe.py` at
push time (P002, whose own evidence lists 4 duplicate pairs closed unmerged and
2 merged in 2026-10-01..15). Both run *after* the work is done. Same-day task
collisions in the records: "project-pages figures" ×9 on 2026-10-16, plus
"simdesign next step" twice on each of three days. 13 project-days had 3 or
more runs touching the same project (for example `mrr-pulse` ×7 on
2026-10-15). Some of those runs were legitimately sequential, but nothing let
the later runs know the earlier ones existed.

### 6. Outcomes aren't joinable to work items

- `projects` is empty in 974 of 1,287 native records.
- `merged` is `null` in 1,503 records, `true` in 65 and `false` in 4. It is
  meant to be filled in after the merge, and almost never is.
  (`prompts/derive.py` measures PR facts separately, but it keys on PRs, not
  on work items.)
- `outcome` is `success` in 94%.

So "what did the last 1,500 runs buy, per item, and what did each item cost?"
can't be answered from the records. That is the question a work allocator
needs answered.

## Proposal: one queue, claimed, scored by what can be measured

Keep everything git-native and file-based. A database or an external
tracker would add an owner dependency and a secret, and this repo works
because state lives in the tree. Build it in four steps, each a normal PR,
each useful on its own.

### Step 1: a single generated queue (`portfolio/work/`)

Add a generator, `portfolio/work/build_queue.py`, that *reads* the existing
sources and writes one `portfolio/work/queue.json`. Item shape:

```json
{"id": "v:where-to-sell-calculator:grailed-channel",
 "kind": "venture-feature | distribution | measurement | research-milestone | process | landing",
 "source": "allocate.py | backlog/P0xx | research/PROJECTS.md#track-3 | unlanded_work.py",
 "track": "ventures",
 "title": "...",
 "done_when": "a checkable sentence or command",
 "score": 0.0, "score_why": ["distribution gap", "untouched 9 days"],
 "status": "open | claimed | done | stale",
 "evidence": ["path or PR"]}
```

Then add one command, `python3 portfolio/work/next.py --track ventures`. It
prints the top unclaimed item and the command to claim it. `prompt.md` and the
track prompts then say "take `next.py`'s item" instead of pointing at five
tools. The existing tools stay as sources; only their role as *instructions*
goes away. The generator runs in CI on merge (the same trigger as the Pages
build), so a session reads a committed file in milliseconds instead of running
a 62-second fetch.

### Step 2: claims via draft-PR title, not a new store

A claim is a draft PR opened in the first minutes of the run, with the item
id in its title (`[work:v:where-to-sell-calculator:grailed-channel] ...`).
`next.py` skips any item that has an open PR with its id, or a PR merged in
the last 24 h. This reuses the "open the PR right away" step that
`land-your-work.md` already asks for, and it needs no write path beyond what
sessions already have. A claim with no commits for 6 h reads as stale and the
item reopens. This moves duplicate detection from push time (P002) to
start time.

### Step 3: a score built from signals that exist today

Until usage readings exist, rank on things the repo can measure. Weight them
in a reviewable `portfolio/work/weights.yaml`:

1. **Owner directions first**, as explicit item kinds: distribution and
   measurement items (`goals.md` 2026-10-16) outrank new features.
2. **Done-ness**: drop an item when its `done_when` check passes. This fixes
   "top row already built", the most common allocate complaint.
3. **Spread**: decay an item's score by recent effort on the same venture or
   track (records and `git log` per path). This replaces the slow 7-day
   fetch with data CI already has.
4. **Family penalty**: score a new item in a template family the router
   already counts (calculator glut) below a consolidation item for that family.
5. **Spent research chains**: when a track's milestones are all checked, emit
   one "propose the next question for track N" item instead of re-drawing into
   micro-variants.

When the first real usage readings arrive, they become one more input in
`weights.yaml`, not a rewrite.

### Step 4: close the loop in the run record

- Add `work_item` (the queue id) to `RECORD_FIELDS`, and have
  `promptctl.py validate` warn when it is empty on a generic-brief run.
- Fill `merged` from `derive.py`'s PR facts in CI instead of hoping a later
  session edits it.
- When a run deviates from `next.py`, record the item it skipped and why. The
  generator can then mark items that are skipped repeatedly as `stale`, so a
  bad item stops recurring.

The review track can then measure what it can't today: cost per *landed item*
per kind, and how often the queue's top item was taken versus overridden.

## What not to build

- **No external tracker** (Jira, Linear, GitHub Projects as the source of
  truth). Each needs an account or token from the owner and duplicates state
  the tree already holds. GitHub Issues could mirror the queue for humans
  later; they shouldn't drive it.
- **No automatic spend escalation** on the score. The router README's warning
  ("Do not add automated spend escalation on top of a signal that has not been
  validated") applies here too.
- **No new queue alongside the old ones.** Step 1 is only worth doing if
  `prompt.md` and the track prompts point at `next.py` *instead of* the
  current tools. Otherwise it becomes the seventh queue.

## Quick wins, independent of the rest

1. Drop or rewrite `session_gate.py`'s "refresh the published snapshot"
   instruction now that Pages deploys from Actions. That instruction is the
   source of most of the gate's 40 friction entries.
2. Stop `allocate.py` fetching history in the session. Read a CI-committed
   commit-count snapshot instead, or skip the column on a shallow clone.
3. Give `research/PROJECTS.md` an explicit "track exhausted" state, plus a
   rule to propose a new question instead of drawing again.

## Limits of this study

- The run records are self-reported. The friction and deviation text is what
  sessions chose to write, so the counts are floors.
- Cost covers only the 826 records with a `usage` block.
- Same-day task-title matches are a rough proxy for duplication. Some are
  legitimate sequential work on one milestone.
- This clone is shallow, so nothing here depends on full git history.
