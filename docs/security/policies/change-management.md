# Change management policy

Status: draft, 2026-11-03. SOC 2: CC8.1, CC5.2.

What the repository already does, written as policy so an auditor can test it.

1. **Every change is a pull request** against `main`; nothing is pushed to
   `main` directly (`.github/rulesets/main.json`, once applied).
2. **CI runs on every PR** for the paths it touches.
   `python3 platform/ci/run_workflow_locally.py --for-changes` runs the same
   checks locally when runners are starved, and the output goes in the run
   record.
3. **Review.** Changes to the control plane (`.github/CODEOWNERS`: agent
   instructions, CI, hooks, the reviewer config) need the owner's approval.
   Other changes merge on green CI, optionally with two cross-review bot
   approvals (`platform/ci/agent_review/README.md`). There is no human second
   reviewer for product code: an accepted risk (R3 in
   `docs/security/soc2/risk-register.md`), offset by the checks and by fixing
   forward.
4. **Production is deployed only from `main`** by
   `.github/workflows/portfolio-pages.yml`, so every deploy maps to a merged
   PR and a commit. Workers deploy the same way (`edge-deploy.yml`).
5. **A post-merge audit** (`control-plane-guard.yml --audit-commit`) turns
   `main` red if a control-plane change landed without the owner's approval.
6. **Emergency changes** follow the same path; for a live incident, the
   owner may merge without waiting for CI and records why in the incident's
   post-incident review.
7. **Traceability:** commit messages and run records say what changed and
   why; `docs/history/` keeps decisions.
