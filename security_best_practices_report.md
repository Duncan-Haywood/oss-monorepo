# Security best-practices report

## Executive summary

The repository now has a baseline security policy, roadmap, and Gitea Actions
scanning for dependencies, infrastructure configuration, and secrets. The most
urgent remaining work is to enforce production approval without relying on
GitHub-only environments and triage the first Gitea scanner run.

## High

### SEC-001 — Infrastructure changes could apply without an approval boundary

- **Location:** `.github/workflows/terraform-apply.yml:50`, Terraform apply job.
- **Evidence:** The workflow previously ran `terraform apply -auto-approve` on
  every matching push to `main`, without an effective approval gate.
- **Impact:** A compromised maintainer session or unsafe merged change could
  alter production infrastructure immediately.
- **Fix:** Pull requests now run formatting and validation without production
  secrets. A manual default-branch run produces the plan with concurrency
  protection.
- **Mitigation:** Add an explicit Gitea-compatible approval check before
  supplying production secrets; Gitea ignores workflow environments.
- **False-positive notes:** If the referenced infrastructure is non-production,
  use a clearly named lower-risk environment instead.

## Medium

### SEC-002 — CI permissions and execution limits were inconsistent

- **Location:** `.github/workflows/ai-first-markets-ci.yml:14`,
  `.github/workflows/ai-first-markets-deploy.yml:6`, and the root deployment
  workflows.
- **Evidence:** Several workflows relied on the CI platform's default token
  permissions and had no timeout.
- **Impact:** A compromised action or hung job could receive broader token
  access than required or consume runners indefinitely.
- **Fix:** Set read-only default permissions, grant writes only to the jobs
  needing them, disable checkout credential persistence in sensitive jobs, and
  add timeouts/concurrency.
- **Mitigation:** Set the repository Actions default token permission to
  read-only and require approval for first-time external contributors.

### SEC-003 — Security findings had no portfolio-level tracking loop

- **Location:** `.github/workflows/security.yml:1`, `SECURITY.md:1`, and
  `docs/security/REMEDIATION_LOG.md:1`.
- **Evidence:** No root security policy, security roadmap, or scheduled
  portfolio scan was present.
- **Impact:** Vulnerabilities could remain visible only in transient CI output
  without an owner or durable remediation plan.
- **Fix:** Added `SECURITY.md`, a security roadmap, retained scan artifacts,
  and automatic creation/update of a Gitea issue when scheduled scans fail.
  The policy scanner now has fixture-based regression tests, and the duplicate
  non-blocking scanner workflow was removed so CI has one authoritative result.
- **Mitigation:** Assign an owner and due date during initial triage.

## Low

### SEC-004 — Third-party Actions are referenced by mutable version tags

- **Location:** `.github/workflows/security.yml:29` and other `uses:`
  declarations under `.github/workflows/`.
- **Evidence:** Actions use tags such as `@v4` rather than immutable commit
  SHAs.
- **Impact:** A compromised or moved upstream tag could change code executed by
  CI.
- **Fix:** Tracked in `docs/security/ROADMAP.md`; a Gitea-compatible dependency
  updater remains to be deployed.
- **Mitigation:** Allow only selected Actions in repository settings and pin
  them to reviewed SHAs during the next hardening pass.
