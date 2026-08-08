# Security policy

## Reporting a vulnerability

Do not open a public Gitea issue containing a vulnerability, credential,
customer record, infrastructure address, or exploit details. Contact the
repository owner through a previously verified private channel.

Include the affected venture, impact, reproduction conditions, and the smallest
safe proof of concept. Never include live secrets or personal data.

## Supported code

Security fixes target the default branch and actively deployed ventures.
Archived prototypes receive fixes only when they are being restored or when a
shared credential or platform component is affected.

## CI security controls

Security follows [the engineering principles](ENGINEERING-PRINCIPLES.md): it is
designed and tested before release, not inspected only at the end.

The `Security` workflow runs on pull requests, default-branch pushes, weekly,
and on demand. It provides:

- High and critical npm/pnpm dependency audits.
- Full-history secret scanning with redacted reports.
- High and critical dependency, configuration, and infrastructure-as-code
  scanning.
- A repository-policy gate for tracked environment files, Terraform state and
  variable files, private keys, and unresolved merge markers.
- Fixture-based tests that prove the repository-policy gate accepts safe
  examples and rejects each prohibited class.

The repository-policy gate also runs in `scripts/test-ci.sh` — the runner used
before a push — as `Repository Security Policy Scan`, against this repository
rather than against fixtures. Those are different questions, and until
2026-08-08 only the fixture one was asked locally: the scanner was invoked by
the `Security` workflow and the Dagger security suite, both of which run *after*
a merge has already happened. In that window commit `30f9ab40` merged a branch
with the conflict unresolved, leaving literal merge markers in
`platform/ci/test/security-audit-log-integrity.test.mjs`; the file stopped
parsing, nine security-audit-log checks executed none of themselves, and the
markers survived six commits before being removed under an unrelated subject
line. The scanner detects that shape in one line and was never asked.

Both halves are needed and neither substitutes for the other: the fixture tests
prove the detectors still detect, and the repository scan proves they have been
pointed at the tree. `platform/ci/test/gate-wiring.test.mjs` fails if the
registration is dropped. Note that the scan reads every tracked file including
the scanner's own tests, so fixtures there assemble prohibited strings from
parts rather than spelling them out; exempting the scanner's tests instead would
put a hole in the control to make its tests fit.
- Reports retained as Gitea Actions artifacts for 30 days and an automatically
  maintained Gitea issue when a default-branch or scheduled scan fails.

The target control set also includes SAST, license checks, container and
published-image scanning, SBOM/provenance, authorization and abuse-case tests,
and DAST against an isolated environment. Critical findings block immediately;
high findings block release unless narrowly risk-accepted by an owner with
compensating controls and an expiry. Suppressions must be evidence-based,
scoped, reviewed, and temporary.

Scanner findings are triaged using the
[security roadmap](SECURITY_ROADMAP.md) and recorded in the
[remediation log](docs/security/REMEDIATION_LOG.md).

## Credential exposure procedure

1. Revoke or rotate the credential first. Deleting a file does not revoke it.
2. Preserve only non-secret evidence: path, commit, credential type, owner, and
   rotation status.
3. Remove the material from the current tree.
4. Assess whether Git history, artifacts, caches, images, logs, forks, or
   deployments contain the value.
5. Rewrite history only with repository-owner coordination, then invalidate old
   clones and caches.
6. Add a regression test or scanner rule before closing the finding.

Security telemetry follows data minimization and redaction. It must not log
credentials, session material, unnecessary personal data, raw sensitive
payloads, or scanner-discovered secret values.

Local `.env*`, `*.tfvars`, and Terraform state files must remain ignored.
Examples must contain placeholders only.
