# Static application security testing

`docs/ENGINEERING-ROADMAP.md` requires SAST to be a required check. Until
2026-08-01 nothing in the repository ran one. `.gitea/workflows/security.yml`
had a secret scanner (gitleaks), a dependency and misconfiguration scanner
(trivy), and a repository policy scanner of our own — and no tool that read the
application source looking for vulnerable code.

## What runs

`scripts/ci/sast_scan.py`, from the `sast` job in
[the security workflow](../.gitea/workflows/security.yml):

| Tool | Scope | Threshold |
| --- | --- | --- |
| Semgrep, ruleset `p/default` (1074 rules) | every tracked file it can parse | all severities |
| Bandit | Python | medium severity and above |

It writes `sast-report.md`, retained as a build artifact for 30 days, and exits
non-zero on any finding that is not in
[the baseline register](../platform/sast-baseline.yaml).

## Why `p/default` and not the language packs

This matters, because the obvious configuration is close to useless and looks
identical from the outside.

The first version of this gate used `p/javascript`, `p/typescript`, `p/python`
and `p/nextjs`. Measured on 2026-08-01 against three deliberately vulnerable
probe files:

| Probe | Narrow packs | `p/default` |
| --- | --- | --- |
| `eval(userInput)` in `.ts` | not detected | detected |
| `eval(userInput)` in `.js` | not detected | detected |
| `exec("ls " + userInput)` | not detected | detected |

The narrow combination loaded 74 rules for a TypeScript file and found none of
these. It reported 3 findings across 710 TypeScript files and would have passed
CI as a green "SAST" check while detecting essentially nothing in the largest
part of the codebase. `p/default` loads 1074 rules and reports 193.

If this configuration is ever narrowed, re-run that measurement first.

## The baseline register

Two kinds of entry, and the distinction is the point of the file.

**`reviewed`** — somebody read the finding, established why it is not
exploitable, and wrote that down. The gate enforces a minimum reason length;
"false positive" does not pass. There are 4, covering a sanitized email
template, a JSON-LD script block, and two `/tmp` string literals that are the
subject of negative tests.

**`inherited`** — present when the gate was switched on, counted but not
individually assessed. There are 73, covering 191 findings. Claiming each had
been cleared in the hour the gate was written would have been untrue, and a
register full of untrue statements is one nobody re-reads. Each carries a
`plan` rather than a justification, and a 90-day expiry rather than 180.

Both are enforced identically and in both directions:

- a finding not in the register fails the run — the new vulnerability;
- a count higher than declared fails — a new occurrence hiding among known ones;
- a count lower than declared fails — a stale waiver, which would otherwise sit
  there ready to silently cover the next finding of that rule in that file;
- an expired entry fails.

Matching is on `(tool, rule, path)` and never on line number. A line-keyed
baseline churns on every unrelated edit above a finding, and a register that has
to be regenerated after unrelated edits gets regenerated without being read.

`path` is an exact path, not a glob, so a new file cannot inherit an existing
waiver.

## Adding an entry

Fix the finding if you can. If you cannot, add to
`platform/sast-baseline.yaml`:

```yaml
  - id: SAST-0NN
    tool: semgrep            # or bandit
    rule: <check_id from sast-report.md>
    path: <exact repository-relative path>
    count: <exact number of occurrences>
    status: reviewed
    owner: <person>
    issue: docs/SAST.md#sast-0nn
    expires: <at most 180 days out>
    reason: >-
      Why this specific occurrence cannot be exploited. At least 20 words, and
      it should name the control that makes it safe.
```

A finding you understand and have decided to accept is not a baseline entry —
it is a `SEC-xxx` in [the security audit log](SECURITY_AUDIT_LOG.md).

## Inherited findings

Remediation order, highest value first. Counts are occurrences.

| Rule | Count | Severity | Next step |
| --- | --- | --- | --- |
| `run-shell-injection` (GitHub Actions) | 6 | error | Move the `${{ }}` input into an `env:` block and reference `"$VAR"` in the script. All six are `workflow_dispatch` inputs in `ventures/local-site-studio/.github/workflows/`, so exploitation needs dispatch access — but this is the classic Actions injection shape and it should not be the pattern in the repository. |
| `detect-child-process` / `dangerous-spawn-shell` / `spawn-shell-true` | 7 | error | `platform/ci/src/pipeline.mjs` and `ventures/retail-pilot-intel/scripts/ci.ts`. Convert to array-argument spawn without a shell. |
| `gha-curl-pipe-shell` | 3 | error | Replace `curl … \| sh` with download, checksum against a pinned digest, then execute — the pattern `.gitea/workflows/ci-cd.yml` already uses for actionlint. |
| ~~`detected-bcrypt-hash`~~ | 0 | — | Resolved 2026-08-05. The literal was the stand-in hash the login route compared against for a non-existent account, pinned at cost 12 while `hashPassword` could issue less; it is now derived at run time by `absentAccountHash()` so the two costs cannot drift. Entry removed from the register. |
| `missing-user-entrypoint` | 1 | error | Add a non-root `USER` to the agent-runner image, as SEC-014 did for the homepage image. |
| `github-actions-mutable-action-tag` | 59 | warning | Pin venture-local `.github/` workflow actions to full commit SHAs. The `.gitea/workflows/` set is already pinned. |
| `path-join-resolve-traversal` | 31 | warning | Mostly CI paths and test fixtures. Assess whether any joined segment can originate outside the repository. |
| `allow-privilege-escalation-no-securitycontext` / `run-as-non-root` | 24 | warning/info | Mechanical `securityContext` additions across `platform/k8s`; worth one change. |
| `unsafe-formatstring` | 45 | info | Largest and lowest-severity group, all in `local-site-studio`. Most are template literals in log and error strings. |
| everything else | 14 | mixed | See the `plan` field on each entry. |

## Known limits

State these rather than discovering them later.

- **The rule set is not pinned.** The tool version is pinned in
  `requirements-sast.txt`; `p/default` is resolved from the Semgrep registry at
  run time. A registry update that adds a rule can turn the job red without
  anything here changing. That is the accepted trade — the alternative is
  vendoring 1074 rules and never learning about a new one — but it means a red
  SAST job is not automatically someone's regression.
- **49 files are only partially parsed.** Semgrep's grammar rejects some
  constructs (`>()` on a generic arrow, a bare `&` in JSX text); it scans the
  file up to that point and warns rather than erroring. Those files are
  therefore not fully covered. The count is held exactly by
  `coverage.semgrep_unparsed_max`, so it cannot grow unnoticed, and every
  affected file is listed in `sast-report.md`.
- **Bandit is gated at medium severity.** At low severity it adds 88 findings,
  42 of them `assert` in test files and 44 `subprocess` calls in CI scripts
  using list arguments and no shell. The full count is in the report.
- **`nosemgrep` is an escape hatch and is registered as one.**
  `scripts/ci/audit_exceptions.py` detects it as a `scanner-suppression`, so
  suppressing a finding at the source requires an entry in
  [the exception register](EXCEPTION-REGISTER.md) with an owner and an expiry.
  Without that, a finding could be silenced one line at a time and this register
  would never see it.
- **Trivy license scanning is still not enabled**, and should not be enabled
  naively. Measured 2026-08-01: `trivy fs --scanners license` returns zero
  findings on this repository, but only because it cannot read licences without
  `node_modules` installed — it logs `"npm install" needs to be performed
  beforehand` and reports clean. Turning it on in the `scan` job, which does not
  install dependencies, would add a permanently green check that measures
  nothing. It needs an install step first.

## Verifying the gate still binds

A scanner that cannot fail is the defect this repository keeps finding in its
own controls. `tests/test_sast_scan.py` covers the register logic and the
fail-closed paths, and `platform/ci/test/sast-workflow-contract.test.mjs` holds
the workflow to invoking the scanner and installing its tools. Neither proves
the scanner detects a real vulnerability. That was checked by hand on
2026-08-01 by adding files containing `subprocess.run(..., shell=True)` with
interpolated input and `eval(input)` in TypeScript; the gate failed on each,
naming the file and rule, and passed again once removed. Repeat that after any
change to `SEMGREP_CONFIGS`.
