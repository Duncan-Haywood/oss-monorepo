# agent-permission-harness

Probe for [`agent-permission-harness`](../../candidates/agent-permission-harness.md).

That candidate is parked, and its write-up ends with the one thing it says is
worth doing anyway:

> Until one of those is true, the harness is worth building **internally** for
> the portfolio's own agents — the cost is small, the corpus starts compounding,
> and it becomes a product later without a wasted start.

This is that internal build. It is 31 workflow files' worth of measurement
against the portfolio's own unattended agent, and it took the mitigation
literally rather than as a gesture — which is how it ended up **refuting the
shape of the product the candidate describes**, in a way no amount of further
screening would have.

---

## The claim under test

The candidate sells **attack replay in CI**: fire prompt-injection and
tool-permission attacks at a running agent on every deploy, and fail the build
when a tool fires that should not have. Its `ai_leverage: 9` is justified as
*"attack generation, mutation, and verdicting are model work end to end."*

Every word of that assumes the interesting question is dynamic — that you learn
whether a tool can fire wrongly by making it fire. This probe asks the prior
question instead:

> How much of "a tool fires that should not have" is decided by the artifact,
> before anything runs?

It answers it by deriving, for every job in `.github/workflows/`, two things and
comparing them:

- the **effective privilege** the job holds — GITHUB_TOKEN scopes after the
  job-over-workflow merge, plus every secret reachable inside it; and
- the **writer set** of each input that reaches a privileged step — who,
  concretely, can change what that step executes.

A finding is that pair. An input whose writer set is wider than the privilege it
reaches is a privilege-reachability defect, and each of the seven rules states
itself in exactly those terms. Writer sets are ordered, widest last:

| Writer set | Who that is |
|---|---|
| `LITERAL` | fixed in the workflow file; changing it means changing the workflow |
| `REPO_WRITE` | anyone who can land a commit on the default branch |
| `DISPATCHER` | anyone who can trigger the workflow (needs write access) |
| `PR_AUTHOR` | anyone who can open a pull request |
| `ANY_USER` | anyone with a GitHub account |

## The result

Full report: [`results-2026-08-23.md`](results-2026-08-23.md). Regenerate with
`python3 check_results_current.py --write` — not `python3 harness.py` on its
own, which omits the provenance header the check expects and so fails it
without changing a single finding.
[`results-2026-08-21.md`](results-2026-08-21.md) is kept
as the prior snapshot: the two differ only in R7, and the difference is the
subject of the amendment below.

**7 findings across 2 of 31 workflow files — 1 defect, 6 posture records. All
7 are decided from the artifact with nothing running. Zero require a running
agent.** One of them — that the agent step holds `contents: write` — would
*also* be visible to attack replay, and it is the one finding that is not a
defect.

The first measurement found 13. R1 and R2 were both the fleet workflow and both
have since been fixed in the separate diff this file asked for; they now read
zero, and `TestHeadlineNumbersAgainstThisRepo` pins the repaired state rather
than the defect. **R4's 4 findings were fixed on 2026-08-21**: the four
third-party actions receiving deploy secrets on mutable tags
(`cloudflare/wrangler-action@v3`, `pnpm/action-setup@v4` ×2,
`amondnet/vercel-action@v25`) are now pinned to the commit SHA each tag
resolved to via `git ls-remote` against the upstream repository — the same
class of pin the agent action itself already carried. R4 now reads zero too.

| Rule | Severity | Count |
|---|---|---:|
| `R1` referenced script absent from the repository | defect | **0** |
| `R2` fixed delimiter on a workflow variable write | defect | **0** |
| `R3` attacker-authored expression spliced into a shell script | — | **0** |
| `R4` third-party action on a mutable ref in a privileged job | defect | **0** |
| `R5` job inherits an undeclared write scope | posture | 5 |
| `R6` agent step holds repository write scope | posture | 1 |
| `R7` agent instruction set exceeds its prompt input | defect | 1 |

The zero is load-bearing. R3 is the canonical GitHub Actions script-injection
class — the one every published scanner leads with — and this repository has
none of it. `opencode-high-throughput.yml` passes its one dispatch input through
an `env:` binding and then regex-validates it, which is the correct pattern. So
the interesting finding here could not be the famous one, and turned out to be
R7.

### Measured accuracy (2026-08-21)

`validate_accuracy.py` — a new, standalone, labeled fixture corpus, not a count
of test methods — runs 34 synthetic cases through `harness.analyse()` for real,
one to two per rule in each direction, and classifies each against its target
rule as a true/false positive/negative. Result:
**0 false positives, 0 false negatives on the 16/34 positive-rule opportunities those fixtures cover across all seven rules (R1-R7)**.
`test_validate_accuracy.py` pins these counts so a rule change that breaks a
fixture is caught rather than left to drift.

Read this narrowly, the same way it is read in
[`validate_accuracy.py`](validate_accuracy.py)'s own docstring and in
[`render_markdown()`](harness.py)'s disclosure section. The corpus is
author-authored — most of it is the same fire/silent fixtures already pinned
in `test_harness.py`, reused rather than restated, plus a handful of genuinely
new cases per rule — so it is a floor on precision and recall against cases
*designed to exercise the rules that exist*, not an out-of-sample estimate and
not a measurement against production workflow files this probe has never seen.
Zero false positives is a predictable consequence of the design (every rule
fires only on structural, positively-named evidence; none infers a defect from
an absence of evidence) confirmed on this fixture corpus, not a guarantee.
Zero false negatives is bounded the same way: it says the seven rules do not
miss the cases built to trip them, and says nothing about an attack or
misconfiguration shape none of the seven encodes — that produces no finding at
all, and this corpus cannot measure what it was never asked to detect. R5 and
R6 are posture records rather than defect calls, so their share of the count is
the narrower claim that each fires exactly when its own documented structural
condition holds, not a vulnerability-accuracy claim.

## The headline: R7, and why attack replay cannot reach it

**An agent's instruction set is not its `prompt:` input.** It is the transitive
closure of what that prompt directs the agent to *read*.

The prompt handed to this portfolio's agent fleet is
[`.github/prompts/portfolio-work.md`](../../../../.github/prompts/portfolio-work.md)
— 52 lines, fixed in the repository, writer set `REPO_WRITE`. What those 52
lines mostly do is issue reading orders. Under *Required reading* and *Hard
constraints* they tell the agent to read and **heed** `CLAUDE.md`, the router
README, every `ventures/*/VENTURE.yaml`, each venture's `IMPROVEMENT-PLAN.md`,
`developmentprocess.tsx`, and — in the imperative — each venture's `AGENTS.md`
("heed them", "read their AGENTS.md first").

Resolved against this checkout, that is **21 files, not 1** — and those 21 are
only the first hop. `CLAUDE.md` is one of them, and what `CLAUDE.md` mostly does
is issue further reading orders: the pipeline directory, the ledger README and
its `break-even.md`, `re-verification.md`, the research index, the router
README. None of those is named by the prompt. Taking the closure to its fixed
point, as [the amendment below](#amendment-2026-08-23-the-closure-is-transitive-and-was-measured-one-hop-deep)
records, the instruction set is **121 files at a maximum depth of 4**.

Every one is an ordinary repository file. Every one is one merged pull request
away from saying something else. And the agent reads all of them while holding
`contents: write`, `pull-requests: write`, `id-token: write`, `GITHUB_TOKEN` and
`OPENCODE_API_KEY`.

An attack-replay harness pointed at this agent tests the `prompt:` input. That
input is 1 of the 121 files in the instruction set, and it is the only one of
the 121 that an attacker has no particular reason to write to. The harness would
test the surface at a ratio of 1:121, and it would test the wrong end of it.

This is not a subtle property that needed a clever tool. It is four regexes over
a markdown file, a glob expansion, and a worklist that keeps going until it
stops finding new files — about 120 lines. It is also invisible to
the dynamic method by construction: replay measures the agent's *response* to
inputs you already thought to send, and the entire point here is that the
instruction surface is larger than the one you were aiming at.

### The generalisation, stated carefully

Any agent whose prompt says "read the repository's conventions and follow them"
has an instruction set equal to those conventions, and the writer set of that
instruction set is the writer set of the repository. That is a structural
property of prompts-that-delegate-reading, not a defect specific to this fleet,
and it is statically enumerable wherever the prompt names paths.

Where it stops being enumerable — and this bound is real — is when a prompt
delegates *discovery* rather than paths: "read whatever the venture's docs tell
you to." This probe cannot follow that, and neither can a regex. It follows
named paths, to a fixed point, from a prompt that names its paths. This
repository's prompt does name them, which is why the number here is exact.

### Amendment 2026-08-23: the closure is transitive, and was measured one hop deep

Everything above this line was written against a measurement of **one hop**.
The rule's own docstring said the instruction set was "the transitive closure of
what the prompt directs the agent to read," the paragraph above said the
property "is statically enumerable wherever the prompt names paths," and the
implementation expanded the prompt's own paths and stopped. That gap is the same
defect class this pipeline keeps finding in itself — a documented figure the
tool does not actually produce — and it understated the finding in the direction
that flatters it.

`instruction_closure()` now walks to a fixed point. Against this repository:

| | Files | (as measured 2026-08-23) |
|---|---:|---:|
| prompt input | 1 | 1 |
| depth 1 — paths the prompt names | 4 | 21 |
| depth 2 | 33 | 56 |
| depth 3 | 10 | 40 |
| depth 4 | 27 | 4 |
| **instruction set (fixed point)** | **74** | **121** |

The right column is the measurement this amendment was written against, kept
because the argument below is stated in its numbers. The left column is the
current checkout: the fleet prompt was rewritten on 2026-08-24 to name four
documents instead of twenty-one, and documentation added since brought the
result back up to 74. See the sixth-instance note at the end of this file for
both moves. The artifact
[`results-2026-08-23.md`](results-2026-08-23.md) is the checked figure; this
table is prose, which is exactly why it went stale once already.

At the time of this amendment the first-hop number was unchanged, so nothing
above it was retracted; what changed is that the walk no longer stops there. Three things are worth naming
about the result:

- **The reachable set is what an attacker would pick.** Depth 2 includes
  `portfolio/ledger/2026-08.yaml`, `portfolio/router/allocate.py` and
  `portfolio/scoring/venture-scores.yaml` — the ledger the router reads and the
  code that decides which venture an unattended session works on next, all
  three reached through `portfolio/router/README.md`. The prompt names none of
  them.
- **The tool is inside the surface it measures.**
  `portfolio/pipeline/probes/agent-permission-harness/harness.py` is itself in
  the closure, at depth 3, reached because `portfolio/research/README.md` names
  it. A file in an agent's instruction set that also decides what that agent is
  told about its own instruction set is worth stating out loud, and it is not a
  hypothetical here.
- **A fix on the way in.** Recursion exposed a resolution bug that one hop had
  hidden. Bare filenames (`` `package.json` ``, `` `AGENTS.md` ``) were resolved
  by a repository-wide walk, which is right for a root-level prompt saying "each
  venture's `AGENTS.md`" and wrong for `ventures/print-atelier/AGENTS.md` saying
  "the scripts in `package.json`" — that answered with all fourteen manifests in
  the monorepo. Resolution is now nearest-scope-first: the naming document's own
  subtree, then the repository. Without it the count was 129; of the extra 14,
  eleven were other ventures' `package.json` and the rest were the same shape —
  `vitest.config.ts`, `not-found.tsx`, and one venture's `ORCHESTRATOR.md`
  pulled in by a *different* venture's `AGENTS.md`. That last one is the clearest
  case: `ventures/retail-pilot-intel/AGENTS.md` says `` `ORCHESTRATOR.md` `` and
  means its own, which is what the scoped walk now returns.

**Two bounds, both stated in the finding text rather than here alone.** The
count is an *upper* bound on what the prompt directs: a named path is counted
whether the document orders the read or merely mentions the file. Distinguishing
those is imperative mood in prose, and a cue-word classifier was tried and
measured worse than either bound — on `CLAUDE.md` it dropped
`portfolio/pipeline/README.md` and `portfolio/research/README.md`, both of which
that file explicitly orders read. Over-approximating is also the safe direction
for a reachability rule, which asks who can *write* to the surface, not how
often the agent reads it. The count is simultaneously a *lower* bound on the
surface: only prose is walked through, so a path named solely inside a `.yaml`
or `.tsx` already in the closure is missed.

The measured-accuracy corpus is deliberately unchanged at 34 cases. R7 fires on
a non-empty closure and did before; this changes how large the closure is, not
when the rule speaks, so re-deriving that corpus would spend budget without
moving a number. The transitive behaviour is pinned in `test_harness.py`
instead — the fixed point, cycle termination, depth attribution, the scoping
rule, the walkable-suffix bound, and the claim that against this repository the
closure is strictly larger than its first hop.

### Amendment 2026-08-24: a sentence in a research index moved this number, and nothing was red

`115` became **117** on `main` without any workflow, prompt, or file in this
directory changing, and the committed results file read as a current measurement
for the whole time it was wrong. The two files that entered the closure are
`portfolio/research/a11y-axe-recall/package.json` and
`portfolio/research/a11y-delivered-contrast/package.json` — both present in the
repository since 2026-08-21, neither in the closure until 2026-08-24. What
changed is that [#699](https://github.com/Duncan-Haywood/monorepo-projects/pull/699)
added a row to `portfolio/research/README.md` — a depth-2 document — whose prose
reads *"all 18 `package.json` files set `\"private\": true\"`"*. The walker resolved
that bare spec against the naming document's own tree and found exactly those
two.

That is the disclosed upper bound doing precisely what it is disclosed to do:
*a named path is counted whether the naming document orders the read or merely
mentions the file.* Here the mention was a **statistic about** `package.json`
files, in a document about publishing channels, and it enlarged a measured
attack surface. The number is not wrong — those files really are named by a
document the agent is directed to read, and the rule's stated direction of error
is this one. It is worth recording anyway, because it shows how little it takes:
one sentence, in a file nobody thought of as security-relevant, in a pull request
about registries.

The failure that mattered is the second one. This workflow triggered only on
`.github/workflows/**`, `.github/prompts/**`, `.github/scripts/**` and this
directory — the inputs the *probe* reads. But the artifact it pins is a function
of the repository's **prose**, which is a much larger set, so a merge to
`portfolio/research/README.md` invalidated the committed measurement with nothing
red to say so. It surfaced only because an unrelated pull request happened to add
a workflow file and so tripped the trigger by accident. The path filter has been
widened to the documents the closure actually walks through; that is still an
approximation of "any prose in this repository", and it is stated here rather
than assumed away.

The pattern is one this repository has now hit on three separate tools: **a
coverage or trigger rule that names the wrong axis fails silently and in the
direction that flatters the record.** `npm-reachability-triage`'s limit named the
ecosystem when the boundary was the lockfile format; this one named the probe's
inputs when the boundary is the closure's reachable set.

What happened next belongs in the record rather than in a commit message, because
it is the pattern `CLAUDE.md` documents landing on one number in one hour.
**Four sessions, none able to see the others, each fixed a different piece of
this.** One changed a workflow's `permissions:`, tripped the old trigger, and
regenerated `results-2026-08-23.md` in place
([#701](https://github.com/Duncan-Haywood/monorepo-projects/pull/701)); two more
([#702](https://github.com/Duncan-Haywood/monorepo-projects/pull/702),
[#704](https://github.com/Duncan-Haywood/monorepo-projects/pull/704)) then
chased the `115`/`35` prose the regeneration had left behind, the second
catching what the first missed. Their work is what is on `main` and this pass
keeps it, dropping its own re-dated copy of the artifact rather than leaving two.

The point worth keeping is what **none** of the three carried, and why. From
each of their sides the number had simply moved, so there was nothing to
explain: no session that arrives after the fact can see that the trigger is what
let the artifact go stale, only that a figure disagrees with an artifact. So
`portfolio/pipeline/probes/README.md` still read `115` after all three, the
`package.json` sentence that moved the count went unnamed, and the path filter —
the actual defect — was untouched. Three passes of cleanup, and the thing that
will do it again next week was still armed. That is the argument for fixing the
trigger rather than the figure.

**It did it again the same night, and this time the widened trigger caught it.**
`117` became **118** when
[#708](https://github.com/Duncan-Haywood/monorepo-projects/pull/708) added
`portfolio/ledger/asks.yaml` and named it from `portfolio/ledger/README.md` — a
depth-2 document in the closure, in a pull request about the owner's decision
queue that had nothing to do with security. Same mechanism as #699's
`package.json` sentence, one file rather than two, four hours later. Two things
are worth recording. The measurement above is now corroborated rather than
anecdotal: a document naming a new path enlarges this surface, and it takes one
line to do it. And the fix worked — the widened path filter turned #708's CI
red *before* the merge, so the artifact and its six prose figures were corrected
in the pull request that moved the number, by the session that moved it, instead
of by three later sessions chasing a figure they could not explain.

**Third instance, 2026-08-24: `118` became `120`, and the trigger caught it
again.** A ledger session amended `portfolio/ledger/break-even.md` — already a
depth-2 document in the closure — to record that two of its closing
recommendations had since been implemented. Saying so required naming the two
tools that implemented them, `portfolio/ledger/decision_queue.py` and
`portfolio/ledger/session_gate.py`, and naming them is what put both into the
instruction set at depth 3 (`37 → 39`). Neither file is new; both have been in
the repository for days, reachable by anyone reading the ledger directory. What
changed is that a document the fleet agent is *directed* to read now points at
them.

This is the third confirmation of the same mechanism and the first where the
enlarging sentence was a **correction** rather than an addition — the session
was removing staleness, which is exactly the maintenance this repository asks
for, and it still moved a security measurement by two files. That is the
cleanest available statement of the finding: the surface grows as a side effect
of ordinary prose upkeep, by authors with no reason to think they are touching
security, and **only the artifact check makes it visible.** The widened path
filter earned its keep for the second time — CI went red before the merge, and
the results file and all four prose figures were corrected in the pull request
that moved them.

**Fourth instance, 2026-08-24: `120` became `122`, and this one was self-
inflicted by a *security-adjacent* edit.** A session consolidating
`portfolio/research/egress-reachability/` added two files —
`check_ask_hosts.py` and `unindexed-hosts.json` — and named them from two
documents already inside the closure: `CLAUDE.md` (depth 1) and that
directory's own README. Naming them is what pulled them in (`57` at depth 2,
`40` at depth 3).

The three prior instances were all authors with no reason to think they were
touching security — a ledger correction, a research index row, an ask record.
This one is the opposite and lands in the same place: the session was **writing
a check to stop a table from going stale**, which is as security-adjacent as
ordinary upkeep in this repository gets, and it still moved the surface by two
files without noticing until CI said so. The mechanism does not care what the
edit is *about*; it cares only that a document the agent is directed to read
now names one more path. Four instances in four days, three different authors,
one direction.

Corrected in the same pull request that moved the number, per the discipline
[#708](https://github.com/Duncan-Haywood/monorepo-projects/pull/708)
established. The depth table above also had a stale row that this pass
repaired: it read `55` at depth 2 while the committed results file read `56`,
so the four rows summed to 119 against a headline of 120. Nothing checks a
sum, which is why it survived — the depth breakdown is prose that no artifact
check re-derives, and it is one more instance of this table's own lesson about
figures nothing recomputes.

**Reversed the same hour: `122` became `120` again.** The two new files are
still in the repository and still do the work; what changed is that the
documents already inside the closure now describe them in prose instead of
naming them as path-spans. The walker only follows a backticked path
expression, so the same check, named differently, is not part of the
instruction set. That is the cheap half of the finding this probe exists to
measure: the surface grows when a directed document *names* a path, not when
the path exists. The artifact and the depth table above are regenerated
against this checkout (21 / 56 / 40 / 4 = 121).

**Fifth instance, 2026-08-24: `120` became `121`.** Same mechanism, one more
path at depth 3 (`39 → 40`), in the pull request that also shipped a
per-engagement positive control on the template-side evidence record. The new
path is not named here: naming it is how the surface grew. Corrected in the
same pull request that moved the number.

**Sixth instance, 2026-08-24: the prompt itself was rewritten, and the depth
table above stopped describing this repository.** The company-direction pull
request replaced the fleet prompt's ~52 lines of reading orders with four named
documents (`AGENTS.md`, `CLAUDE.md`, `portfolio/DIRECTION.md`,
`portfolio/pipeline/README.md`), taking depth 1 from `21` to `4` and the fixed
point from `121` to `41`. It regenerated the results artifact and left the table
above reading `21 / 56 / 40 / 4 = 121` — a figure for a prompt that no longer
exists, surviving for the usual reason: **nothing recomputes the table, only the
artifact.**

A follow-up pull request then took `41` to `72` by adding `PRODUCT_PLAYBOOK.md`
and `portfolio/usage/README.md` and naming them from three documents already at
depth 1; merging main brought two more depth-2 paths in, for `74`
(`4 / 33 / 10 / 27`) in the tree this table was regenerated against. Both new
files are ordinary documentation. The 27 files that appeared at depth 4 are the
compounding this rule exists to show: a document that is *itself* newly inside
the closure brings everything it names, so the surface grows by far more than
the count of files a diff adds — two new documents, thirty-three new files in the
instruction set.

That same pull request also hit the race this probe's CI had against `main`:
two runs on one commit computed `72` and then `73`, because the default
`pull_request` checkout measures an ephemeral merge-with-main preview while
concurrent sessions push to `main` continuously. The workflow now checks out the
PR's head SHA, making the measurement a function of the commit under test. A
closure count is only reproducible if the thing measured holds still.

Pinning the head SHA fixed the half of that race a pull request can see. The
other half only shows up after merge, and on 2026-08-24 it had `main` red
continuously — runs 436, 442, 447, 458 and 463. Checking out the head SHA makes
the number right *for that commit*; it does not make it right for `main`, which
by then also contains whatever else landed. So a pull request adding an
unrelated markdown file that names a new path is green at its head, enlarges the
closure, and turns the next push to `main` red. Regenerating the snapshot is not
a fix either: `#954` regenerated `77`, merged, and two minutes later `#946` and
`#942` made it `78`. The snapshot-regen PR chasing that (`#955`) was redundant
before it could land.

The gate now runs [`check_results_current.py`](check_results_current.py), which
masks R7's repository census — closure size, per-depth histogram, first-hop
count, sampled paths — on both sides and compares everything else byte for byte.
A finding that appears, disappears, moves line or changes rule still fails. This
is the choice the test suite had already made: `TestHeadlineNumbersAgainstThisRepo`
asserts the closure *claim* and declines to pin the count, "because the exact
count moves with every venture added". The committed artifact still carries the
real numbers for a reader; they are simply no longer a merge-blocking assertion
about a repository that never holds still. **Byte-equality is the wrong gate for
a measurement whose subject is the whole repository** — the staleness it reported
was real, but unfixable by whoever happened to merge next.

Both corrections are in this pull request: the artifact is regenerated and the
depth table now reads the current checkout. Two things worth keeping from the
pair. **Shrinking the prompt is the lever that works** — dropping seventeen
depth-1 reading orders cut the surface by two thirds, far more than any
individual document does. And **a cross-reference is not free**: the direction
this repository is now run on asks for less required reading, and every "see also"
added to a directed document is measured here whether or not it was written as an
instruction.

## What this probe deliberately does not do

It makes **no judgement about whether an agent would misbehave** given a
reachable input. Not "would this injection work", not "should this tool have
fired", not a verdict of any kind.

That refusal is the point, not a limitation to apologise for. The candidate's
actual product is that judgement, and every honest thing this probe found comes
from *not* conflating the two halves:

- **The static half** — which inputs reach which privilege — is deterministic,
  cheap, and complete in the sense that it enumerates the surface. It has no
  model in it anywhere.
- **The dynamic half** — whether a given reachable input actually causes a wrong
  tool call — is genuinely undecidable statically, is what a customer's security
  review is gating on, and is what would be sold.

A product that ships both and reports one number cannot tell a buyer which half
found the finding. This probe reports the split per finding
(`observable_by_replay`), so the ratio is a measurement rather than a
marketing claim.

## What it means for the candidate

**One score moves: `ai_leverage` 9 → 8.** The derivation is in
[`candidates.yaml`](../../candidates.yaml)'s `measured:` block. In short: the 9
was justified as *"attack generation, mutation, and verdicting are model work
end to end"*, and the first working version of the internal build the
candidate's own mitigation prescribes contains **no model at all** — 13
findings, 7 rules, zero inference. That does not refute the 9 for the dynamic
half, which is untested here. It does show that the part that shipped first and
found everything there was to find is deterministic analysis.

The composite falls 7.0 → 6.875. The floor stays 4, and the verdict stays
**park**: nothing here touches `time_to_revenue` or `distribution`, which are
what park rests on.

**Two things are argued and deliberately not scored**, because arguing is not
measuring and this pipeline has been burned by the difference:

1. *Defensibility.* Everything the static half does, published open-source
   Actions scanners already do for R3/R4/R5, and the whole of `harness.py` is
   960 lines of standard library plus PyYAML. R7 is, as far as this probe's author
   can tell, not in those tools — but "as far as I can tell" is not a
   substitute-supply measurement, and the egress needed to run one is denied
   here (see [`substitute-supply`](../../../research/substitute-supply/)). The
   `defensibility: 5` therefore stands, flagged rather than moved.
2. *The named mitigation.* The candidate's mitigation is "build internally so
   the **attack corpus** compounds at near-zero cost." One iteration of that
   build produced a **rule set**, not an attack corpus — and rule sets are the
   commoditized part. One iteration is not enough to refute a mitigation, so it
   is recorded here rather than struck.

## Findings this probe reports, and what has been fixed since

All seven defects were reported and none were remediated in the probe's
original pull request. That is a deliberate split, matching how
[`eaa-wcag-triage`](../eaa-wcag-triage/) held its 965 contrast remediations: a
probe is a measurement, and mixing measurement with remediation makes both
harder to review. Three of the seven (R1, R2, R4) have since been fixed in
separate diffs, as the bullets below record. Specifically:

- **R4 (4 findings) was reported here as un-fixable from this session and is
  now fixed, in the separate diff this bullet asked for.** The blocker as
  originally stated — "resolving a tag to a SHA requires reaching those
  repositories, and this session's GitHub scope is this repository only" —
  conflated the GitHub MCP tool's repository scope with this session's network
  reach. `git ls-remote` against the three upstream repositories (a plain git
  operation, not a GitHub-API call) resolves a tag to the commit SHA it
  currently points at without touching the GitHub API at all, and is exactly
  as verifiable as reading a SHA off a release page. `cloudflare/wrangler-action@v3`,
  `pnpm/action-setup@v4` ×2 and `amondnet/vercel-action@v25` are now pinned to
  the SHAs `git ls-remote` returned for those tags, matching the pin the agent
  action itself already carried. R4 now reads zero.
- **R1 and R2 were in the agent fleet's own workflow, and are fixed.** They got
  the separate diff this bullet asked for rather than riding along with a
  measurement. The dead `prepare-agent-prompt.sh` branch is deleted — the
  fallback it always took is now the only path, so the file reads as what it
  runs — and the prompt goes into `$GITHUB_OUTPUT` behind a per-run
  `openssl rand -hex 16` delimiter instead of the literal `PROMPT_EOF`. That
  second one mattered: the content is `portfolio-work.md`, which is `REPO_WRITE`,
  so anyone who could write a `PROMPT_EOF` line into it could close the value
  early and have the remainder parsed as further step outputs. Hardening only —
  the schedule stays disabled and the trigger is still `workflow_dispatch` alone,
  so nothing here adds or re-enables automation, which is the direction
  `CLAUDE.md` actually gates.
- **R5 (5 findings) is posture**, not a defect: the fix is declaring
  `contents: read` on the jobs that do not need the file-level floor.
- **R7 has no one-line fix**, which is why it is the finding worth having. The
  real mitigations are structural — narrow the token scope the agent holds while
  reading, or treat the conventions files as data rather than as instructions —
  and both are design decisions, not patches.

R5 and R7 remain on issue #139 for the account owner. R1, R2 and R4 no longer
are: they were hardening of a disabled workflow or of CI-config action pins,
verifiable in full from this checkout, and are fixed above.

## Running it

```
python3 harness.py                     # markdown report over this repository
python3 harness.py --json              # machine-readable findings
python3 harness.py --repo-root PATH    # another checkout
python3 -m unittest discover -p 'test_*.py'
```

No network, no writes, no credentials. PyYAML is the only dependency and it is
already in `portfolio/router/requirements.txt`.

## Tests

84 tests. Each rule is pinned on a synthetic repository in both directions —
the negative cases matter more than the positive ones, since a rule that fires
on everything is worth less than no rule.

`TestHeadlineNumbersAgainstThisRepo` asserts the claims above directly against
the live `.github/workflows`: that R3 still finds nothing, that nothing found
requires a running agent, that the missing prompt script is still missing, that
the delimiter is still fixed, that the instruction closure is still an order of
magnitude larger than the prompt, and — since the 2026-08-23 amendment — that
the closure is strictly larger than its own first hop and reaches files the
prompt never names. A workflow edit that changes any of those turns this red
rather than leaving a document quietly describing a repository that no longer
exists.

`TestInstructionClosureWalk` pins the walk itself on synthetic trees, apart from
the rule that reports it: that it continues past the first hop, that a cycle
terminates (`CLAUDE.md` and `README.md` cite each other here, so this is the
ordinary case), that each file is attributed to whichever document reached it
first, that data files are counted but not walked through, and that bare
filenames resolve against the naming document rather than the whole repository.

Two of those tests exist because a bug got through: the fixture builders assert
that they produce the YAML they claim to. An indentation error in a fixture made
a workflow unparseable, `analyse()` skips unparseable files by design, and the
result was three rules that silently never fired while their tests passed.

## Rules, in full

| Rule | Fires when | Severity |
|---|---|---|
| `R1-missing-referenced-script` | a `run:` block invokes a repo-relative script not in the repository. The guarded case is the interesting one — a fallback keeps the job green, so what executes is not what the file reads as executing | defect |
| `R2-static-output-delimiter` | non-literal content is written to `$GITHUB_OUTPUT`/`$GITHUB_ENV` behind a fixed delimiter. A line equal to the delimiter closes the value early and the remainder parses as further assignments | defect |
| `R3-untrusted-expression-in-run` | an attacker-authored expression context is spliced into a shell script, where it is read as script rather than data | defect |
| `R4-unpinned-third-party-action` | a non-first-party action resolves through a tag or branch its owner can move, in a job holding a secret or a write scope | defect |
| `R5-inherited-write-permission` | a job declares no `permissions:` and inherits a write-granting file-level floor | posture |
| `R6-agent-holds-write-scope` | an agent step runs with repository write scope. Recorded as the baseline the other findings are measured against | posture |
| `R7-agent-instruction-closure` | an agent's prompt directs reads of repository files, making those files part of its instruction set | defect |

## Positioning constraints this probe follows

From [`probes/README.md`](../README.md) and
[`channel-inventory.md`](../../channel-inventory.md):

- **No compliance or security claim.** This reports reachability, not safety.
  "Nothing found" is not "secure" — the dynamic half is untested by
  construction, and the product's own liability note ("never certify") applies
  to the probe first.
- **No payment, no personal data, no account requiring an identity artifact.**
- **Coverage limits stated in the product, not buried.** The one-hop bound on
  R7 and the untested dynamic half are stated above, not in a footnote.
- **Publishing is a separate decision from building.** Nothing here is
  published, and this candidate's channel is developer tooling, which
  [`channel-inventory.md`](../../channel-inventory.md) measures as
  egress- or scope-denied for this portfolio in any case.
