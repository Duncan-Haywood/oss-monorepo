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
- Reports retained as Gitea Actions artifacts for 30 days and an automatically
  maintained Gitea issue when a default-branch or scheduled scan fails.

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

Local `.env*`, `*.tfvars`, and Terraform state files must remain ignored.
Examples must contain placeholders only.
