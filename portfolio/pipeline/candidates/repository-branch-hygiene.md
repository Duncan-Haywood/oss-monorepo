# Candidate: Repository branch hygiene and recovery

**One line.** A read-only GitHub App or CLI that inventories stale branches and
closed pull requests, distinguishes duplicate refs from unique recoverable work,
and produces an approval queue plus a recovery manifest before any deletion.

**Verdict: probe.** The first value is a safe report, not an automated delete. The
repository lifecycle problem is visible, but distribution and willingness to pay
are unmeasured.

Scored 2026-08-24. Composite 6.5 · floor 4 (distribution).

| Dimension | Score | Why |
|---|---:|---|
| AI leverage | 6 | Git graph analysis is deterministic, while models can cluster duplicate branches, summarise unique commits, and explain uncertain cleanup recommendations |
| Autonomous ops | 8 | Scheduled read-only scans, graph comparisons, reports, and notifications can run without an operator queue |
| Time to revenue | 5 | A small engineering team can trial a report quickly, but repository access and security review slow B2B conversion |
| Gross margin | 9 | API calls, graph computation, storage, and modest inference are the main delivery costs |
| Defensibility | 5 | Customer-specific branch and PR history plus recovery manifests accrue value, but the core Git analysis is copyable |
| Distribution | 4 | GitHub Marketplace and DevOps communities are plausible channels, but no owned buyer channel is established |
| Liability containment | 7 | The default is read-only and reports facts; it does not delete, certify repository state, or claim that work is safe to discard |
| Ethical robustness | 8 | It reduces operational noise and accidental loss while preserving customer control, and exposes uncertainty instead of pressuring destructive cleanup |

## Why this is distinct

This is not [agent permission harness](agent-permission-harness.md), which audits
agent permissions and prompt-injection behaviour. It is not
[software evidence provenance](software-evidence-provenance.md),
[vendor-change evidence](vendor-change-evidence.md), or
[public-record watch](public-record-watch.md): it analyses customer-authorised
Git refs and pull-request metadata rather than release provenance, commercial
web pages, or public registers.

It is also not PR #829's internal branch-cleanup workflow. That proposal deletes
the head ref for this repository after a merge or a grace period after closure.
This candidate is a customer-facing, multi-repository inventory product whose
default output is a review queue and recovery manifest. Optional deletion would
require explicit per-ref approval and a fresh safety check.

## Boundary

- Request read-only repository permissions for the initial product.
- Classify refs as duplicate, unique work, shared, moved since closure, protected,
  or uncertain; never collapse uncertainty into a deletion recommendation.
- Include the current tip, related pull request, commit set, and an exportable
  recovery manifest in every proposed cleanup.
- Do not delete automatically. If an approved deletion action is added later,
  re-fetch the tip immediately before it and skip protected or shared refs.
- Keep repository data customer-owned and provide an export and retention control.

## Existing signal

PR #829's read-only sweep found 608 branches against six open pull requests and
reported 220 candidate cleanup refs across 500 pull requests. It also found 107
heads whose tips had moved after the pull request closed. The moved-tip result is
evidence against naive age-based deletion: a closed PR's branch can still contain
work that is not present on `main`. The sweep is evidence of an operational pain
point, not evidence that an external buyer will pay.

## First experiment

Seven days, under EUR150:

1. Build a local, read-only scanner over synthetic repositories covering merged,
   closed, reopened, moved-tip, shared-ref, fork, and protected-branch cases.
   **Built 2026-08-24** — [`probes/repository-branch-hygiene/`](../probes/repository-branch-hygiene/).
2. Produce a human-readable report and recovery manifest for each proposed
   cleanup, then verify that every unique commit remains recoverable.
   **Built and checked 2026-08-24**, by test rather than by assertion: every
   commit the manifest calls exclusive is confirmed unreachable from all other
   refs, and every `duplicate`/`shared` ref is confirmed to lose nothing when
   deleted *alone*.
3. Show the report to ten GitHub-heavy agencies or teams operating automated PR
   fleets. Ask three to provide a repository for a read-only pilot and one to
   pre-pay EUR50/month for a recurring report. **Unrun** — customer contact, and
   the step that actually decides this candidate.

Kill it if fewer than three qualified teams will run the read-only pilot or if no
team values the recovery report enough to pay. Do not add write permissions until
the report itself demonstrates paid value.

**What steps 1–2 established, 2026-08-24.** No score moves; this is software
evidence, and distribution (the floor, 4) is untouched by it.

- The seven scenarios classify correctly against an oracle the fixture builds
  itself, so the tests do not grade the scanner against its own output.
- **The safety boundary needed a correction the write-up did not anticipate.**
  Two refs at the same tip are each individually safe to delete and are not
  *jointly* safe. Per-ref verdicts approved as a batch would destroy the
  commit while every individual verdict stayed true. A test pins the loss, and
  no category the report emits says "delete" — the strongest is "review".
- Three defects surfaced and are kept as regression tests: `duplicate_of` named
  an arbitrary ref rather than preferring a protected branch; the first real
  repository run classified every tracked branch as `shared` with its own
  remote copy; and a Cursor Bugbot review on the pull request caught that
  grouping refs by name (the second fix) then compared only each name's
  primary tip, so a diverged remote copy at another branch's exact SHA could
  leave a commit reported as exclusively unique while a live ref elsewhere
  still reached it — the recoverability claim itself.
- **`moved` is not reachable outside the fixture.** It needs a branch's tip as
  recorded when its PR was last seen closed; no bare scan has that. PR #829's
  107 moved tips are why the category matters, and wiring the scanner to a real
  snapshot source is unbuilt — so the candidate's most distinctive claim is the
  one still resting on someone else's measurement.

## Mitigations required by the rubric

For distribution, secure one repeatable DevOps community or channel partner
before building a hosted service. For the defensibility floor, retain
customer-owned signed snapshots and portable recovery manifests, then test
whether a new entrant can reconstruct the same history without the customer's
watch list. The safety boundary is a product requirement, not a claim that the
candidate is safe by default: deletion remains approval-gated and race-checked.
