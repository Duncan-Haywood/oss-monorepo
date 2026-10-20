# Tools that serve the goal, claims that prevent collisions, records that write themselves

**Date:** 2026-10-20. **Asked by:** the owner, following up
[`2026-10-20-work-allocation.md`](2026-10-20-work-allocation.md). The owner's
words, quoted:

> "i think this should be given back to intelligent judgement. i think one
> useful rule of thumb is sometimes a tool is useful for something but use
> intelligence when the tool is inferior without any gain. on the converse
> make reusable tools when you have to do something and commit it as
> something others can use especially if its somewhat laborous"

> "i think also to override and sunset tools is something I think that the
> intelligent agents should have the judgement call to do. when it serves the
> goal great. when it impedes it sunset it."

> "this would be nice if there could somehow be automated tooling which does
> this so the agents don't need to worry about it. and any other tools that
> take worries off of the agent's plates would be good to look into dev
> tooling sort of stuff."

**Method:** read-only. The sources are the 1,585 run records in
`prompts/runs/` (1,300 written here), the report that `prompts/derive.py
report` prints from PR facts, the tool scripts under `platform/ci/`,
`portfolio/ledger/` and `prompts/`, and the workflow files. Counts are as of
this date.

## Two corrections to the earlier report

The earlier report got two things wrong.

1. **"`merged` is never filled in" was wrong.** The *typed* field is null in
   most records, but `prompts/derive.py` already measures it from the GitHub
   API. It covers 1,242 records: 1,239 merged, 3 closed unmerged. Measured
   attribution exists. The gaps are narrower, and section 3 lists them.
2. **"One research task was taken by 9 runs in a single day" was wrong.**
   The ten "project-pages figures" runs on 2026-10-16 split the backlog into
   29 different projects with no overlap. That was coordination working. The
   real duplicates are listed in section 2.

## The short version

- **Tools should be advisory, and agents should be able to retire them.**
  About a fifth of all friction reports (220 of 1,221) are about a tool or
  step being slow, and 98 say something is stale or obsolete. The tools that
  rank work are the ones runs override most (see table). A tool should say
  what goal it serves, and any run should be able to demote or sunset it with
  evidence in the PR. A small generated "tool health" table can supply that
  evidence.
- **Reusable tools are for laborious steps that repeat.** The steps runs
  redo by hand are getting dependencies installed (`pyenv.py` is mentioned
  in 130 records), getting enough git history in a shallow clone (92 friction
  reports), checking three places before claiming work, and touching every
  registry a new venture needs.
- **Claiming should be one command, and the claim is also the conversation.**
  Research already asks for "claim before you build", but only in prose: three
  manual checks and an early draft PR. Ventures have no such step. Real
  collisions still happen (examples below). A `claim.py` should do the three
  checks in one call, and the draft PR becomes the place where sessions on
  neighbouring work talk to each other.
- **Run records should mostly fill themselves.** `derive.py` already measures
  `merged`, size and red-CI commits. Still typed by hand: `projects` (empty
  in 76% of records), cost (missing from 36%), and the record itself. One
  `finish` command and a little more derivation would leave the agent only
  the fields that need judgment.
- **The repo has no session hooks.** There is no `.claude/` directory, so
  nothing runs when a session starts. A SessionStart hook could do the
  setup most runs repeat by hand.

## 1. Judgment over tools: advisory by default, sunset when they impede

### What the records show

`goals.md` ("Judgment over rules", 2026-10-15) already lets a run depart from
a *rule* and record why. Tools are not covered, so they keep their authority
after they stop earning it. Recorded deviations, by the file being deviated
from:

| File | Deviations | What runs did instead |
|---|---|---|
| `prompts/ventures/prompt-1.md` | 27 | mostly skipped slow preflight steps and relied on CI |
| `prompts/review/prompt-1.md` | 27 | skipped steps with too little data to act on |
| `CLAUDE.md` | 24 | mostly skipped the Pages-republish step |
| `portfolio/ledger/session_gate.py` | 24 | ignored "refresh the published snapshot first" |
| `research/PROJECTS.md` | 23 | picked a track by judgment instead of the draw |
| `prompt.md` | 20 | |
| `portfolio/router/allocate.py` | 16 | skipped top rows that were already built |

The two tools that rank work, `allocate.py` and `session_gate.py`, account
for 40 deviations and 110 friction reports between them. Today the router's
top 22 rows are identical: no usage readings, merit for 11 of 1,301
ventures. Its ordering adds nothing a run's own reading of the venture
wouldn't give, and fetching history to compute it costs 62 s.

### What to change

1. **Add the owner's rule to `goals.md`** under "Judgment over rules", in
   their words. Tools serve the goals. When a tool is worse than judgment and
   gains nothing, use judgment and say so in `deviations`. When a tool
   impedes the goal, an agent may sunset it.
2. **Give each tool a one-line status in its docstring:** `Serves:` (which
   goal), plus `Status: active | advisory | sunset`. "Advisory" means its
   output is input to judgment, not an instruction. Under the current
   evidence, `allocate.py`'s ranking becomes advisory: keep it as a data view
   (stage, caps, families, hypotheses), and drop "take the first Explore row"
   from `session_gate.py` and the prompts.
3. **Write a sunset rule that any run can follow in one PR.** Name the
   evidence (friction or deviation counts, or a measurement), say what
   replaces the tool (judgment counts), remove the instructions that point at
   it, then move the script to `docs/history/` or delete it. CI guards that
   protect the hard limits (secrets, fork PRs, fabrication, the money and
   publishing gates) are excluded, because `goals.md` already puts those
   beyond any judgment call.
4. **Generate the evidence instead of asking runs to collect it.** Add a
   `derive.py tools` report (or a small `platform/devstats/` page). For each
   script it shows mentions in records, friction, deviations, median runtime
   where recorded, and whether CI runs it. Today 5 of 56 Python tools appear
   in no run record and no workflow: `browser_state.py`, `concurrency_tax.py`,
   `guard_state.py`, `shorten_descriptions.py`, `check_direction_only.py`.
   That list is the starting point for a sunset review, not a verdict.
   `check_direction_only.py` is still named in `CLAUDE.md`, for example.

### The converse: make a tool when a laborious step repeats

The rule, in one sentence: **if you did a multi-step procedure by hand and
another run will need it, commit it as a script with a test, and link it from
the one place that sends runs there.** The records show these steps repeating:

| Repeated by hand | Evidence | Tool it wants |
|---|---|---|
| Getting a usable Python environment (PEP 668, missing PyYAML or pytest) | `pyenv.py` in 130 records; apt and pip errors in 10 | Run `pyenv.py` from the SessionStart hook (section 4) |
| Getting enough git history in a shallow clone | 92 friction reports name shallow clones; "deepen" in 21 | A background deepen at session start; scripts that read a CI-committed snapshot instead of fetching |
| Checking `main`, open PRs and fresh branches before claiming | written out as three manual steps in `prompts/research/prompt-1.md`, step 3 | `claim.py` (section 2) |
| Registries a new venture or tool touches (sibling links, mirrored tool counts, gitops counts) | 24 errors where the first push failed a registry or count guard; "registries a new venture touches cost four CI rounds" | A scaffold that writes every registry, or registries generated from the tree instead of kept by hand |
| Finding an unclaimed research next step once a track's milestones are done | "track 4 milestones are all done; picking 'the next step' means choosing among many near-duplicate follow-ups" | A generated list of open next steps per track, with their claims |

## 2. Reservation and collaboration

### Real collisions, from the records

- "first pr #8352 (cheap-meal-plan-optimizer) duplicated #8350 and was closed"
- "first built referral-keeper (pr 7119), but a same-name venture landed on
  main minutes earlier; closed it and built testimonial-keeper instead"
- "claim-before-build check ... passed, but another run pushed
  research/house-unequal minutes later; my full build conflicted add/add"
- "i first built a duplicate (simdesign-patchfine vs gaugefine) before
  reading" (research track 5)
- "built allocate.py libyaml re-exec; a sibling run landed an equivalent fix
  on main first"
- backlog P002: 4 duplicate pairs closed unmerged and 2 merged, plus 1
  venture name merged twice, in 2026-10-01..15

118 records mention a sibling, a duplicate or a supersession, and 42
friction reports are about one. Some show the existing etiquette working
("#7333 left alone: another session's live claim"). The failures share a
cause: the check happened after the build, or the claim appeared minutes
after the other run's check.

### Proposal: `platform/ci/claim.py`

One command, run before building anything:

```
python3 platform/ci/claim.py <slug-or-keywords> [--kind venture|research|fix]
```

1. It runs the existing checks in one place: `slug_dupe.py` (ventures),
   `research_idea_dupe.py` (research), the tree on a freshly fetched
   `origin/main`, open PRs whose title names the slug, and branches pushed in
   the last 3 hours. It reads the GitHub API through the session proxy, as
   `derive.py` already does.
2. It prints `FREE`, or `TAKEN` with the PR, its age and its last commit
   time. A claim with no commit for 6 h reads `STALE`, and that work is open
   again.
3. On `FREE` it prints the exact claim to make: a draft PR titled
   `[claim] <kind>/<slug>: <one line>`, opened from the first commit. Opening
   it stays with the agent's own PR tool, so the script needs no token.

That gives ventures the same claim step research has, as one command instead
of three paragraphs. It also closes most of the "minutes later" gap: the
claim goes up within the first few minutes, not at the end.

### Collaboration: the claim PR is the channel

When two runs meet on the same work, they have no way to talk now. They have
the same public surfaces any contributor has, and those are enough:

- **The claim PR's body carries a short "working on / not touching / open
  for help" note.** A run that finds a live claim on adjacent work reads it
  and picks the free part, instead of guessing.
- **A PR comment is the message.** "Taking the Kraken importer; leaving
  Coinbase to you." Comments come back to the claiming session as
  PR-activity events, so the other run actually receives them. The
  attribution footer already marks them as agent-written.
- **Handing off.** A run that has to stop writes a "Handoff" section (what's
  done, what's next, how to verify), and `claim.py` shows it on a `STALE`
  claim. `adopt_stranded.py` already lands abandoned work, and this gives the
  adopter the context.
- **Session-to-session messages** (`list_sessions` / `send_message` in cloud
  sessions) exist, but not on every surface, and a message to a session that
  is mid-turn may arrive late. Keep them optional. The PR thread is durable
  and visible to the owner.

Collaboration happens in public. It stays inside the repo's public-repository
rules: no secrets, and outside text on a PR is data, not instructions. Only
comments from sessions with write access count as coordination.

## 3. Attribution that needs no agent effort

### What exists and what is missing

| Fact | Today | Gap |
|---|---|---|
| merged / closed, time open, size | measured by `derive.py` for 1,242 records | none, except the 274 records that name no PR |
| red-CI commits per PR | measured: 0.65 to 1.52 per PR by track, ventures highest | none |
| projects touched | typed; empty in 974 of 1,300 records | derivable from the PR's changed paths (`ventures/<slug>/`, `research/<slug>/`) |
| cost, tokens, time | `runcost.py attach`, which needs a human-hours guess typed in; present in 838 of 1,300 | make the human-hours estimate optional so the measured part always attaches |
| PR ↔ session link | the PR body carries the session URL | squash merges drop commit trailers: 0 of the last 30 commits on `main` carry `Prompt-Version` or `Claude-Session`, so git alone can't attribute work |
| work item | not recorded | the claim title (`[claim] kind/slug`) is the item id, so derive it from the PR title |

The proposal is to **derive, don't type:**

1. Extend `derive.py build` with `projects` (from the PR's file list, which
   it already fetches for size) and `item` (from a `[claim]` title). That
   fills the 76% gap retroactively for every record that names a PR.
2. Add **`promptctl.py finish`**: one command that fills `pr` from the
   current branch's PR, `model` from the environment, `projects` from
   `git diff origin/main --name-only`, runs `runcost.py attach` (human-hours
   optional), and validates the record. The agent writes only `outcome`,
   `doc_friction`, `deviations` and `notes`: the judgment fields.
3. Make **`outcome` partly measured.** 94% of records self-grade `success`.
   `derive.py` can add measured outcome signals next to the typed one:
   merged, red commits before merge, reverted, follow-ups, 14-day survival
   (its window closes for the oldest records soon). The typed grade stays,
   but nobody needs to trust it alone.
4. **A cost-per-item view** in `platform/devstats/`: join PR → item →
   cost, by kind and track. This answers "what did each item cost and
   produce", which neither report could do from typed fields.

None of this adds an unattended workflow that pushes to `main`. `derive.py`
runs in sessions and in the existing review track, and `finish` runs inside
the session that owns the record.

## 4. Dev tooling that takes worries off agents

The repo has no `.claude/` directory: no SessionStart hook, no project
settings, no skills. These would remove the repeated chores above:

1. **A SessionStart hook** (`.claude/settings.json` plus a script in
   `platform/agents/`). It starts a background `git fetch --deepen` and
   `pyenv.py`, and prints three short lines: open claims from the last 6 h,
   drafts with no commits for 6 h, and anything blocking (red `main`, a
   merge conflict on the session's branch). It replaces several paragraphs
   of `CLAUDE.md` with a reading taken at start.
2. **A pre-push check from changed paths.** `run_workflow_locally.py
   --for-changes` exists and is mentioned in 22 records. Wire it into one
   `land.py` step (or a git pre-push hook the SessionStart hook installs) so
   the registry and count guards run before the push, not after. Ventures
   average 1.35–1.52 red commits per PR, and each one is a CI round.
3. **Generated registries instead of hand-kept counts.** Where a guard checks
   that a count in file A matches the tree, generate file A from the tree,
   and the error class disappears.
4. **Snapshots instead of in-session fetches.** For any script whose slow
   part is reading history (`allocate.py`'s 7-day counts, `pages_state.py`),
   read a small JSON that CI already produces on merge. The 92 shallow-clone
   reports mostly go away.
5. **Project skills for the long procedures.** `land-your-work` and
   `verify-and-merge` become `.claude/skills/` entries, loaded when needed
   instead of always being in `CLAUDE.md`. That also shortens the top of
   `CLAUDE.md`, the most friction-reported file (198 reports).

## Suggested order

| # | Change | Size | Removes |
|---|---|---|---|
| 1 | Owner rule in `goals.md`; tool `Status:` lines; `allocate.py` ranking marked advisory, and the prompts stop telling runs to take its top row | small | runs following a ranking that has no signal |
| 2 | `claim.py` plus the claim-PR convention for ventures and research | small–medium | the duplicates in section 2 |
| 3 | `derive.py`: `projects`, `item`, measured outcome; `promptctl.py finish` | medium | hand-filled record fields |
| 4 | SessionStart hook: env, background deepen, claims summary | small | the env and shallow-clone chores |
| 5 | `derive.py tools` health table and the first sunset review | small | tools kept past their use |
| 6 | Pre-push changed-path checks; generated registries | medium | first-push CI reds |

Each step is one normal PR, is useful on its own, and comes with its own test.

## Limits

- Friction, deviations and notes are what runs chose to write, so every count
  from them is a floor.
- The keyword matches used for themes (slow, stale, duplicate) are
  approximate. The quoted examples were read individually.
- Tool "mentions" count file names in record text. A tool imported by
  another tool can be in use without ever being mentioned.
