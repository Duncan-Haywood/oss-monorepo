# Reference docs are not chronicles (2026-10-24)

**Reader:** an agent about to edit a guidance or reference file here.
**Question (owner, 2026-10-24):** review the documentation "from a
chronicalling and lesson pov without hard fast rules that limit agents when
their intelligence could figure out a solution."

## What I looked at

The guidance map (`prompts/system.json`, 47 files) and the files those
guides point runs at. Two readings:

- `python3 prompts/rule_language.py`: absolute wording ("never", "must",
  "do not") per file, split by whether the line is on a liability topic.
- Dated lines (`YYYY-MM-DD`) and "Amended/Corrected/Superseded <date>"
  headings per file, a rough measure of how much of a file is story rather
  than current state.

## What I found

**Most guides are already in "fact, recommendation, one line of why"
form.** The 2026-10-15 to 10-21 passes (`docs/history/claude-md-2026-10-15.md`,
`docs/reports/2026-10-20-rules-deadweight.md`, the guidelines-not-rules
rewrite) did that work. `CLAUDE.md`, `AGENTS.md` and the runbooks carry a
handful of dates each, mostly attributions of an owner direction, which is
the useful kind of date: it says who decided and when, so a later run can
tell a standing decision from a stale one.

**`prompts/goals.md` carries 54 dated lines,** nearly all quoted owner
directions. That is a chronicle of decisions, and it is the owner's file;
I left it alone. If it is ever trimmed, the same split applies: the current
direction stays, superseded wording goes to `docs/history/`.

**The outlier was `portfolio/hosting/README.md`:** 362 lines, 31 dated
lines, nine dated amendments and corrections stacked under a 2026-08-25
decision. 32 lines named the retired Hetzner/k3s route, `marisstella.dev` or
the retired `gh-pages` branch. The current state (Pages from Actions since
2026-10-20) was in the last section, labelled "moved from CLAUDE.md". A run
asking "where is the catalogue served?" had to read the whole file, in
order, and work out which amendment overrode which. This is the failure
`steering.md` names ("History is for study, not for steering") in a file
that sits in the reference layer, whose job is "what is true now".

**The stale story had leaked into tools.** `session_gate.py` and
`allocate.py` printed advice pointing at `portfolio/DIRECTION.md`'s "Current
priority" section, which was cut on 2026-10-21, and told runs the owner
flip still needed was `deploy-settings`, which was granted on 2026-09-06.
`AGENTS.md`, `PRODUCT_PLAYBOOK.md` and `DEVELOPMENT_QUALITY.md` repeated
parts of the same story (a "Hetzner product box" as a host option; "deploy
first, the owner flip is `deploy-settings`").

## What changed

| File | Change |
|---|---|
| `portfolio/hosting/README.md` | Rewritten as current state, how a product gets served, and six one-line lessons. 362 → 122 lines, 20.5 KB → 6.7 KB, dated lines 31 → 7. |
| `docs/history/hosting-2026-08-25-to-10-24.md` | The old file verbatim, with a header saying what it is and that its addresses are a retired origin. |
| `docs/history/README.md` | New: an index of the history directory, one lesson per file with its period, and the patterns that recur across them. |
| `session_gate.py`, `allocate.py` | Advice strings point at the hosting file and say `deploy-settings` is granted; "outranks" became "usually outranks". `test_session_gate.py` and the router tests pass (148). |
| `AGENTS.md`, `PRODUCT_PLAYBOOK.md`, `DEVELOPMENT_QUALITY.md` | Stale Hetzner and deploy-first wording replaced with the current state. "Do not add Cloudflare or Vercel" (three copies) became one reason: Pages is $0, another host is an account only the owner can open, so it needs a stated need Pages cannot meet. |
| `gitops/prod/host/README.md` | Its pointer to the hosting file's "Amended 2026-09-06" section now points at the history file. |

`rule_language.py` default-topic absolutes: 184 → 176. That count was not the
aim, and most of the remaining 176 are facts that happen to use "never"
("the user's data never leaves their machine") or sit next to a liability
topic.

## What I did not change, and why

- **Research write-ups with amendment trails** (`portfolio/research/*`,
  `research/*`). A dated correction to a finding is part of the result's
  record; moving it would hide that the finding changed. The history README
  says so.
- **`goals.md`** (owner's file).
- **Hard-limit wording.** "Never" on fork PRs, secrets, money, fabrication
  and legal text stays; those are the one-way doors.

## Lessons for the next editor

1. **Edit the state in place; append the story elsewhere.** An "Amended
   <date>" heading added under an old section is the cheapest edit to make
   and the most expensive to read: every later reader pays to reconcile it.
   Architecture Decision Records solve the same problem the other way round:
   a decision record is never edited, and a new record supersedes it
   (Michael Nygard, "Documenting Architecture Decisions", 2011). Either works;
   what fails is mixing the two in one file.
2. **Grep tools for the prose you retire.** Two Python scripts were still
   printing a section name cut three days earlier. `grep -rn "<section
   title>" --include=*.py` before deleting a heading.
3. **A lesson keeps its evidence one link away.** The new hosting file keeps
   each lesson to one line and links the history file, so a reader who
   doubts it can check, and a reader who doesn't is not slowed down.
4. **Postmortem archives are for recognition, not compliance.** Google's SRE
   book frames postmortems as shared learning, written so others can spot a
   similar situation (*Site Reliability Engineering*, 2016, ch. 15,
   "Postmortem Culture"). `docs/history/README.md` is written to be read
   that way: a table of situations, not a list of prohibitions.

## Next candidates

By the dated-line measure, the remaining always-read and reference files
are close to current. The largest stacks of amendments outside the
guidance map are in `gitops/prod/host/README.md` and other `gitops/prod/`
docs, which describe the origin retired on 2026-10-01; marking those
directories as history (or moving them) would stop a run from reading them
as live.
