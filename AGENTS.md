# Repository-wide agent instructions

These instructions apply across the repository. More specific venture
instructions may add commands or constraints but do not lower this quality bar.

Read `ENGINEERING-PRINCIPLES.md` before making material changes.
Read `docs/QUALITY-ENGINEERING.md` for every production, user-visible, or Tier
2/3 change.

- Treat untested behavior as broken. Add tests that fail without the change,
  including regression, boundary, failure, security, and recovery cases needed
  by the risk. Do not satisfy coverage with meaningless assertions.
- Run the narrowest relevant checks while iterating and the venture's complete
  verification command before handoff. Report checks that were not run.
- Review your final diff against the acceptance criteria and try to disprove
  your own implementation. Material changes then require an independent agent
  run or human review that reads the diff and evidence without relying on your
  summary. Resolve findings and rerun affected checks before handoff.
- User-visible changes require real-browser testing of critical happy, failure,
  recovery, responsive, keyboard, accessibility, and visual states. Inspect
  screenshots/traces; a build, DOM assertion, or automated accessibility scan
  alone is insufficient.
- Never weaken, skip, broadly suppress, or retry-away a test or scanner merely
  to obtain a green result. Exceptions need an owner, reason, issue, and expiry.
- Use secure defaults, runtime input validation, server-side authorization,
  least privilege, and redacted structured telemetry. Never commit or print
  secrets or unnecessary personal data.
- Keep infrastructure, CI/CD, GitOps desired state, schemas, migrations,
  policies, alerts, dashboards, runbooks, and retention rules in code.
- Deploy immutable full-SHA artifacts by digest through GitOps. Never use a
  mutable tag as production desired state or make unrecorded manual drift.
- Do not promote a production UI service without a blocking browser suite on
  the exact candidate. Missing tooling, fixtures, services, baselines, or
  reports fail closed; exceptions require an owner, issue, compensating
  evidence, and expiry.
- Add or update operational and product measurements with every material flow.
  Include ownership, purpose, data classification, retention, failure signals,
  and the decision the measurement supports.
- Usage analytics and customer feedback must be minimal, lawful, ethical,
  accessible, statistically honest, and useful for a defined decision. Honor
  consent, opt-out, access, retention, and deletion requirements.
- Update relevant docs, roadmap items, runbooks, and venture metadata in the
  same change. Completion requires evidence from tests, scans, build, deployed
  health, and data/customer checks appropriate to scope.
