# Exception register

`ENGINEERING-PRINCIPLES.md`, `AGENTS.md`, `CONTRIBUTING.md` and
`docs/DEV-WORKFLOW.md` all state the same rule: suppressions, quarantines,
skipped checks and scanner exceptions are permitted, but each one needs an
owner, a reason, an issue, and an expiry.

Until 2026-07-31 that rule was written in four places and enforced in none. This
document and the two files below close the roadmap control
*"Define an owner and expiry for every suppression, quarantine, skipped check,
accepted vulnerability, and policy exception."*

| Artifact | Role |
| --- | --- |
| `platform/exception-register.yaml` | The register. One entry per accepted exception. |
| `scripts/ci/audit_exceptions.py` | The audit. Scans tracked source, fails closed. |
| `tests/test_audit_exceptions.py` | Its tests, including the repository contract. |

## Why this control exists

A suppression produces the same green result as working code. That is the whole
problem: nothing distinguishes a `# type: ignore` over a genuinely
un-expressible cast from one hiding a real defect, and nothing ages either of
them out. The three constructs this catches, in order of damage:

1. **`test.only(...)`** silently drops every other test in its file. A suite can
   fall from two hundred assertions to one and still report success.
2. **`continue-on-error: true`** makes a CI step incapable of failing its job,
   so a required gate becomes decorative without ever going red.
3. **Inline lint/type/scanner suppressions** trade a permanent loss of checking
   for a one-off convenience, and they are never revisited.

## How the audit works

Run it directly:

```bash
python3 scripts/ci/audit_exceptions.py
```

Inventory what exists without auditing:

```bash
python3 scripts/ci/audit_exceptions.py --report
```

It scans **tracked files only** — untracked build output is not ours to police,
and `node_modules` would drown every real finding. Each detected suppression
must be claimed by a register entry with a matching `kind` and `path` glob.

The register is a **ratchet**, not an allowlist. Every entry carries a `count`,
and the audit fails in both directions:

- **more occurrences than registered** — a suppression was added without an
  owner or an expiry;
- **fewer occurrences than registered** — a suppression was removed and the
  grant was not lowered. A register that drifts above reality becomes a list of
  permissions for code that no longer exists, which is how these documents rot.

An entry also fails if it is missing any required field, if `expires` has passed,
or if `expires` is more than **180 days** out. A permission that never comes up
for review is a policy change made without one.

## Adding an exception

Fix the underlying problem first. If it genuinely cannot be fixed now, add an
entry to `platform/exception-register.yaml`:

```yaml
  - id: EXC-0NN
    kind: type-suppression        # see `DETECTORS` in the audit script
    path: ventures/example/src/*  # fnmatch glob; `*` also matches `/`
    code: "no-explicit-any"       # optional: substring the matched line must contain
    count: 1                      # exact number of occurrences accepted
    owner: duncan
    issue: docs/EXCEPTION-REGISTER.md#exc-0nn
    expires: 2026-12-31           # at most 180 days out
    reason: >-
      What the suppression is doing and why the underlying problem cannot be
      fixed instead. "It was easier" is not a reason.
    compensating_control: >-
      What still catches the failure this suppression stops catching. If the
      answer is "nothing", the exception should not be granted.
```

Then add a subsection below saying what has to happen before the expiry date.
Entries are matched in file order and each occurrence is claimed once, so put
specific entries above broad ones.

## Gate wiring

A second register, in the same shape and for the same reason, lives in
`scripts/ci/gate_wiring.py` as `REGISTERED_UNWIRED`. It answers a different
question: not *is this suppression accounted for* but *does anything execute
this control at all*.

`platform/ci/test/gate-wiring.test.mjs` asked that question of shell only — its
input is `scripts/**/test-*.sh`, four files — so the eighteen Python controls in
`scripts/ci/` were audited for reachability by nothing. Twelve of them are
registered in `scripts/test-ci.sh` because twelve separate commits put them
there, which is not a rule and does not survive a deletion.

`scripts/ci/audit_killed_ventures.py` is what that costs. It was written,
committed, and given a five-case unittest, and no runner, workflow or module
ever named it. It also imported `portfolio/router/allocate.py` — the orphaned
engine nothing runs — and asked it for an allocation at `total_budget_usd=500.0`
while the authoritative `portfolio/router/router.py` allocates at $300, then
told venture owners to record overrides under `kill_criteria_overrides`, a key
read by `allocate.py` alone. Unreachable, and pointed at the wrong engine, so
wiring it would have been worse than deleting it.
`scripts/ci/stopping_rule_review.py` already does that job against
`portfolio/router/kill_criteria.py`, with a register, in both directions, and is
wired. The file is deleted, and `tests/test_gate_wiring.py` fails if it returns.

Every `scripts/ci/*.py` must now be either invoked by a runner or a workflow
`run:` step, or carry a `Registration`. Four do:

| Control | Kind | Checked predicate |
| --- | --- | --- |
| `release_lag.py` | `pytest-gated` | `tests/test_release_lag.py` exercises it and names `REPO_ROOT` |
| `branch_collisions.py` | `pytest-gated` | `tests/test_branch_collisions.py` exercises it and names `REPO_ROOT` |
| `baseline_trust.py` | `library` | declares no `__main__`; imported by the two above, which execute |
| `terraform_images.py` | `library` | declares no `__main__`; imported by `image_tags.py` and `image_release_path.py`, both wired |

The `why` on each entry is prose for a reader and is **not** what holds it. Each
`kind` carries a typed evidence field that `tests/test_gate_wiring.py`
recomputes from source on every run, because a register whose entries are only
prose goes false in silence while every count stays green — this repository has
been bitten by that shape in its budget ratchet and its claims controls alike.
An entry whose predicate stops holding fails; so does one that outlives its
control, one that sits beside a live invocation, and one whose `expires` has
passed or is more than `MAX_REGISTRATION_DAYS` out.

Two traps the detector is written against, both live in this tree:

- **A `paths:` filter is not an invocation.** `.gitea/workflows/deploy-services.yml`
  names `scripts/ci/terraform_images.py` in two `paths:` lists and runs it
  never. A substring search reads that as wiring.
- **A comment is not an invocation.** `scripts/test-ci.sh` carries a paragraph
  above every gate, and several name controls that are wired elsewhere or not at
  all. An invocation must put an interpreter on the same line, outside quotes and
  outside a comment.

`MAX_UNWIRED_CONTROLS` caps the register at 4 and is watched downward by
`scripts/ci/cap_ratchet.py`, so the only direction it travels is toward zero.

## Deliberate scope limits

Being honest about what this does **not** cover:

- **`|| true` and `set +e` in shell** are out of scope. They are idiomatic for
  diagnostics and cleanup, and requiring registration for all 14 current uses
  would bury the signal. `ventures/quick-pick-survey/src/lib/ciContract.test.ts`
  covers that construct for the CI files where it does convert red to green.
- **Accepted vulnerabilities** are tracked separately in
  `docs/SECURITY_AUDIT_LOG.md` under `SEC-xxx`, which already carries severity
  and status. The roadmap item names both; this register covers the code-level
  half and the security log covers the advisory half.
- **The detector matches text, it does not parse.** A suppression named inside a
  string literal or a comment is reported (see [EXC-009](#exc-009)). That is the
  safe direction to be wrong in: a false positive costs one register entry, a
  false negative costs the control.

## Remediation plan

The two entries with a shorter expiry are the two that represent real lost
checking. The rest are structural and expire on the standard horizon.

### EXC-001

**Generated `docs-site` output — 26 `eslint-disable`, expires 2027-01-27.**
`build-docs.mjs` emits a file-level disable into each TSX file it generates from
markdown. No action needed unless the docs site stops being generated; at that
point the disables become hand-written code and must go. Types are still checked
by `next build`, so only style rules are suppressed.

### EXC-002

**Convex `any` shim in `local-site-studio` — expires 2026-10-31.**
Real lost type safety on a database-touching module. Generate the Convex client
so the API surface is typed, then delete the hand-written `any` map and this
entry. Shorter expiry than the structural entries for that reason.

### EXC-003

**`react-hooks/set-state-in-effect` in `AdminView` — expires 2027-01-27.**
The rule cannot see through the `await` boundary and reports a synchronous state
set that does not occur. Recheck when the React ESLint plugin is next upgraded;
if the rule learns to handle async callbacks, remove the disable.

### EXC-004

**Broad `except Exception` in a `photo-editing` test harness — expires 2027-01-27.**
Captures failures raised on a worker thread and re-raises them into the
assertion. Remove if the harness moves to a mechanism that propagates thread
exceptions natively.

### EXC-005

**Broad `except Exception` in the `ubuntu-agent-server` poll loop — expires 2027-01-27.**
The documented supervisor pattern: one bad poll must not kill the daemon. It
logs with context before continuing. Revisit only if the runner gains a
structured retry/backoff layer that classifies failures.

### EXC-006

**Two `pragma: no cover` in `photo-editing` test helpers — expires 2027-01-27.**
Re-raise paths that are uncovered whenever the code under test works. In test
code, so they cannot inflate the production coverage figure the roadmap
ratchets. Remove alongside EXC-004.

### EXC-007

**Eight `# type: ignore` narrowing casts in `photo-editing/src` — expires 2026-10-31.**
Each follows a runtime membership check that mypy cannot use to narrow `str` to
a `Literal`, and each raises `AnalysisLoaderError` on the failing branch first.
The fix is a shared `TypeGuard` helper, which would remove all eight at once.
These are in production code, hence the shorter expiry.

### EXC-008

**Fifteen `# type: ignore` in `photo-editing/tests` — expires 2027-01-27.**
Negative type tests: each deliberately passes the wrong type to assert that
runtime validation rejects it, so the suppression is what lets the test compile.
Removing them would delete boundary tests rather than fix anything. Expected to
persist; re-confirm at expiry that each is still inside an assertion that the
call raises.

### EXC-009

**Prose mention in `prompt_process.tsx` — expires 2027-01-27.**
Not a suppression. A stored engineering lesson quotes the string
`@ts-expect-error` while explaining the outage one caused. If it ever becomes a
real suppression the count rises and the audit fails.

### EXC-015

**Three `react-hooks/set-state-in-effect` in `print-atelier/src` — expires 2027-01-31.**
Mount-only hydration from `localStorage` in `capture/page.tsx`, `CheckoutLab.tsx`
and `ArtistOnboardingIntakeForm.tsx`. The rule's suggested alternative, a lazy
`useState` initializer, cannot be used: `localStorage` does not exist during SSR,
so the server and client first renders would disagree. Same rule and same shape
as [EXC-003](#exc-003). Arrived with the eslint-config-next 16 upgrade, which is
where these React Compiler rules become errors — the code predates them.
Recheck at expiry, and remove if the rule learns to recognise SSR-safe hydration.

### EXC-016

**One `react-hooks/preserve-manual-memoization` in `ProductDetailPreviewCTA.tsx` —
expires 2027-01-31.**
"Compilation Skipped: Existing memoization could not be preserved" is React
Compiler declining to optimise the component, not a defect report. The `useMemo`
is hand-written with a complete dependency array. Remove the disable when a
compiler release compiles the component, or when the memo is restructured into
something it can prove.
