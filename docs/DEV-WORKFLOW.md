# Monorepo Developer Workflow & Quality Policy

This document outlines the standard ongoing development, security, reliability, and testability practices for all projects in this monorepo.

---

## 1. Local Developer Setup & Pre-Push Quality Gate

### Quick Start: Install Pre-Push Hooks
To ensure security policy scans and verification checks run automatically before every `git push`, run:

```bash
bash scripts/security/install-hooks.sh
```

### Manual Local Verification
Before opening a Pull Request or pushing changes to `main`, run the monorepo verification suite:

```bash
bash scripts/dev-verify.sh
```

This command runs, without swallowing failures:
- Repository security policy scan (`scripts/security/scan-repository.sh`) to prevent accidental commits of secrets, `.env` files, or un-rendered credentials.
- CI and scanner contract tests.
- Workflow and shell linting when `actionlint` and `shellcheck` are installed.
- Terraform formatting and initialized validation.
- Each active venture's typecheck, lint, tests, and production build where defined.

---

## 2. CI/CD Pipeline & Automated Security Controls

Every Pull Request and push to `main` triggers automated CI gates:

### Security & Compliance (`.github/workflows/security.yml`)
- **Action Pinning**: All third-party GitHub Actions are pinned to immutable commit SHAs with release tags in comments.
- **Repository Policy Scan**: Scans tracked files for tracked `.env`, credentials, private keys, or unresolved merge conflicts.
- **Trivy Scanner**: Audits dependencies, IaC (Terraform/K8s) configurations, and secret patterns.
- **Gitleaks**: Scans complete Git history for exposed credentials with redacted evidence.
- **Trivy**: Scans dependencies and infrastructure configuration for high/critical findings.
- **Lockfile audits**: Blocks on high/critical npm or pnpm advisories.

### Runtime smoke testing (`scripts/smoke-test.sh`)
- Run only after a deployment controller reports the intended immutable image healthy.
- Validates endpoint reachability, content, health/readiness, and runtime security headers.
- It is deliberately not attached to a build-only workflow: testing the old production release does not validate the newly built artifact.

---

## 3. Security Ownership & Triage Policy

- **Code Ownership (`.github/CODEOWNERS`)**: Changes to `.github/workflows/`, `platform/terraform/`, `platform/k8s/`, or security scripts require approval from designated security & infrastructure owners.
- **Triage SLA**:
  - **Critical Findings**: Must be resolved immediately; blocks production deployments.
  - **High Findings**: Must be resolved within 7 days or risk-accepted with an owner and expiration in `SECURITY-ROADMAP.md`.
