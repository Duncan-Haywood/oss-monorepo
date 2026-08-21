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

Full report: [`results-2026-08-21.md`](results-2026-08-21.md). Regenerate with
`python3 harness.py`.

**13 findings across 3 of 31 workflow files — 7 defects, 6 posture records. All
13 are decided from the artifact with nothing running. Zero require a running
agent.** One of them — that the agent step holds `contents: write` — would
*also* be visible to attack replay, and it is the one finding that is not a
defect.

| Rule | Severity | Count |
|---|---|---:|
| `R1` referenced script absent from the repository | defect | 1 |
| `R2` fixed delimiter on a workflow variable write | defect | 1 |
| `R3` attacker-authored expression spliced into a shell script | — | **0** |
| `R4` third-party action on a mutable ref in a privileged job | defect | 4 |
| `R5` job inherits an undeclared write scope | posture | 5 |
| `R6` agent step holds repository write scope | posture | 1 |
| `R7` agent instruction set exceeds its prompt input | defect | 1 |

The zero is load-bearing. R3 is the canonical GitHub Actions script-injection
class — the one every published scanner leads with — and this repository has
none of it. `opencode-high-throughput.yml` passes its one dispatch input through
an `env:` binding and then regex-validates it, which is the correct pattern. So
the interesting finding here could not be the famous one, and turned out to be
R7.

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

Resolved against this checkout, that is **21 files, not 1**. Every one is an
ordinary repository file. Every one is one merged pull request away from saying
something else. And the agent reads all of them while holding
`contents: write`, `pull-requests: write`, `id-token: write`, `GITHUB_TOKEN` and
`OPENCODE_API_KEY`.

An attack-replay harness pointed at this agent tests the `prompt:` input. That
input is 1 of the 21 files in the instruction set, and it is the only one of the
21 that an attacker has no particular reason to write to. The harness would test
the surface at a ratio of 1:21, and it would test the wrong end of it.

This is not a subtle property that needed a clever tool. It is four regexes over
a markdown file and a glob expansion — about 60 lines. It is also invisible to
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
you to." This probe cannot follow that, and neither can a regex. It follows one
hop from a prompt that names its paths. This repository's prompt does name them,
which is why the number here is exact.

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

## Findings this probe reports and does not fix

All seven defects are reported and none are remediated in this pull request.
That is a deliberate split, matching how
[`eaa-wcag-triage`](../eaa-wcag-triage/) held its 965 contrast remediations: a
probe is a measurement, and mixing measurement with remediation makes both
harder to review. Specifically:

- **R4 (4 findings) cannot be fixed from here.** The fix is to pin
  `cloudflare/wrangler-action@v3`, `pnpm/action-setup@v4` ×2 and
  `amondnet/vercel-action@v25` to 40-character commit SHAs. Resolving a tag to a
  SHA requires reaching those repositories, and this session's GitHub scope is
  this repository only. The remediation is named and blocked, not skipped. Note
  the shape of the finding: the agent action *is* SHA-pinned
  (`anomalyco/opencode/github@e5cc278…`), so the repository already holds the
  rule and applies it inconsistently — and the three unpinned ones are the
  three that receive deploy secrets.
- **R1 and R2 are in the agent fleet's own workflow.** `CLAUDE.md` puts
  unattended spend-capable automation in the human-gated class. These are pure
  hardening of a workflow whose schedule is already disabled — delete the dead
  `prepare-agent-prompt.sh` reference or add the script; generate the
  `PROMPT_EOF` delimiter per run — but they are edits to the most
  consequence-carrying file in the repository, and they deserve their own diff
  and their own review rather than riding along with a measurement.
- **R5 (5 findings) is posture**, not a defect: the fix is declaring
  `contents: read` on the jobs that do not need the file-level floor.
- **R7 has no one-line fix**, which is why it is the finding worth having. The
  real mitigations are structural — narrow the token scope the agent holds while
  reading, or treat the conventions files as data rather than as instructions —
  and both are design decisions, not patches.

These are on issue #139 for the account owner rather than merged here.

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

60 tests. Each rule is pinned on a synthetic repository in both directions —
the negative cases matter more than the positive ones, since a rule that fires
on everything is worth less than no rule.

`TestHeadlineNumbersAgainstThisRepo` asserts the claims above directly against
the live `.github/workflows`: that R3 still finds nothing, that nothing found
requires a running agent, that the missing prompt script is still missing, that
the delimiter is still fixed, and that the instruction closure is still an order
of magnitude larger than the prompt. A workflow edit that changes any of those
turns this red rather than leaving a document quietly describing a repository
that no longer exists.

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
