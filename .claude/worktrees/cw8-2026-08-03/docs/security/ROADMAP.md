# Security roadmap

## Immediate: establish the gate

- Merge and require the `Security` workflow.
- Triage its initial secret, dependency, and IaC findings from the Gitea
  Actions artifacts.
- Rotate any detected credential before attempting history cleanup.
- Complete SEC-001 through SEC-003 in the remediation log.
- Require the Gitea `Security` workflow in the protected `main` branch rule.
- Restrict Gitea Actions tokens and runner registration.
- Add SAST and license-policy gates, repair all currently failing required
  security jobs, and test each scanner/policy with safe and unsafe fixtures.
- Add negative authorization, runtime input-validation, CSRF, SSRF, upload,
  webhook-signature, and secret/client-boundary tests where those risks exist.

## Next 30 days: remove mutable trust

- Complete SEC-004 through SEC-006.
- Pin deployment and scanner images by digest and external actions by reviewed
  commit SHA.
- Enforce deployment approval in Gitea-compatible workflow logic; Gitea does
  not use an `environment` declaration as a production approval gate.
- Add a Gitea-compatible dependency updater such as Renovate.
- Add container-image scanning before publication and again on a weekly schedule.
- Generate and retain SBOM and build provenance for immutable release digests;
  add signature verification before GitOps promotion.
- Define patch service levels: critical within 24 hours, high within 7 days,
  medium within 30 days, and low in normal maintenance.

## Next 60 days: venture-level controls

- Add threat models for authentication, payments, admin routes, user uploads,
  and agent execution boundaries.
- Add authorization and abuse-case integration tests for every public API.
- Inventory data retention, personal data, backups, and deletion behavior per
  venture.
- Test telemetry redaction, consent/opt-out, retention expiry, access controls,
  and deletion propagation; add DPIAs where risk or law requires them.
- Add runtime header and TLS verification to post-deployment smoke tests.
- Review Kubernetes workloads for non-root execution, read-only filesystems,
  dropped capabilities, network policies, and resource limits.

## Ongoing

- Review failed Gitea Actions runs, retained artifacts, and open remediation
  issues weekly and after every production incident.
- Run quarterly access, dependency, action-pin, and disaster-recovery reviews.
- Record every material finding and fix in `REMEDIATION_LOG.md`.
- Measure time-to-triage, time-to-fix by severity, open findings by age, and
  repeat findings.
- Review exception/suppression expiry, dependency freshness, authorization-test
  coverage, image re-scan results, and remediation regression evidence.
