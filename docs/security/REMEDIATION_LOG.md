# Security remediation log

This log tracks repository findings that need human ownership. Scanner-native
alerts remain the detailed system of record; do not copy secrets or sensitive
payloads here.

| ID | Severity | Problem | Evidence | Owner | Target | Status | Fix / verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | High | `ai-first-markets` declared Next.js `^15.2.4`, below the patched 15.2 baseline in the repository security guidance. | `ventures/ai-first-markets/package.json` | Venture owner | Immediate | Fixed | Updated Next.js to `^15.5.21`; typecheck, lint, Next production build, and Cloudflare build passed locally. The broader lockfile findings remain separately tracked as SEC-011. |
| SEC-002 | High | `print-atelier` declares the old Next.js 14.2 line and ESLint 8. | `ventures/print-atelier/package.json` | Unassigned | Immediate | Open | Upgrade onto a supported patched Next.js line and validate Stripe and rendering flows. |
| SEC-003 | High | Terraform was configured to auto-apply on every push to `main`; Gitea ignores the workflow `environment` approval feature. | `.github/workflows/terraform-apply.yml` | Platform | Immediate | In progress | Apply is now manual-only, which reduces exposure. Add an explicit Gitea-compatible approval mechanism before treating the gate as complete. |
| SEC-004 | High | Several installers download a script and pipe it directly to a shell. | `platform/infrastructure/setup-cluster.sh`; `ventures/ubuntu-agent-server`; nested local-site-studio workflows | Unassigned | 30 days | Open | Pin a version and checksum or verify a signed release before execution. |
| SEC-005 | Medium | Agent runner defaults to a mutable `agent-runner:latest` image. | `ventures/ubuntu-agent-server/roles/agent_runner` | Unassigned | 30 days | Open | Publish immutable version or digest tags and require an explicit deployed image. |
| SEC-006 | Medium | A nested workflow uses `anomalyco/opencode/github@latest`; other actions use movable major tags. | `ventures/local-site-studio/.github/workflows`; root workflows | Unassigned | 30 days | Open | Pin third-party actions to reviewed full commit SHAs and schedule controlled updates. |
| SEC-007 | Medium | Security-sensitive ownership and protected-branch settings are not verifiable from repository files. | Repository settings | Repository admin | 14 days | Open | Enable the settings listed in `docs/security/README.md` and record verification. |
| SEC-008 | Critical | Terraform configuration embedded Gitea, Pairwise PostgreSQL, Grafana, OpenCode, and monitoring Basic Auth credentials. | `platform/terraform/gitea.tf`; `platform/terraform/pairwise_db.tf`; `platform/terraform/monitoring.tf`; `platform/terraform/opencode_agent.tf`; `platform/terraform/admin_security.tf` | Platform | Immediate | Fixed in code; rotation pending | Values are now required sensitive variables injected from protected environment secrets. Rotate every former credential before deployment and assess Git history and state copies. |
| SEC-009 | High | Ignored local credential and Terraform state files were readable by other local users. | Local working tree only; values not logged | Platform | Immediate | Fixed locally | Sensitive local files are mode `0600`; retain this permission and migrate state to an encrypted remote backend. |
| SEC-010 | High | The first repository security workflow incorrectly relied on GitHub-only CodeQL, Security-tab SARIF, Dependabot, and issue APIs even though `origin` is Gitea. | `.github/workflows/security.yml`; repository remotes | Platform | Immediate | Fixed in code | Replaced with Gitea-compatible runner scans, artifacts, dependency audits, and `GITEA_TOKEN` issue logging. Verify on the first Gitea Actions run. |
| SEC-011 | High | The current `ai-first-markets` lockfile audit reports 13 high-severity dependency findings. A global `brace-expansion` override was tested and rejected because it broke incompatible `minimatch` module APIs. | `ventures/ai-first-markets/package-lock.json`; local `npm install --package-lock-only` summary | Venture owner | Immediate | Open | Triage advisories in an approved environment, upgrade each affected parent dependency onto its compatible patched branch, and require typecheck, lint, Next build, Cloudflare build, and a clean high-severity audit before closure. |

## Status values

Use `Open`, `Accepted risk`, `In progress`, `Fixed`, or `False positive`.
Accepted risks and false positives require rationale, approver, and review date.
