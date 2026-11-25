# Rulesets

`main.json` is the intended `main` branch ruleset (live ruleset id 26239454).
GitHub does not read this file; an admin applies it:

```bash
gh api -X PUT repos/Duncan-Haywood/oss-monorepo/rulesets/26239454 --input .github/rulesets/main.json
```

Why it looks the way it does:

- **0 approvals, no Code Owner review, no human in the loop** (owner,
  2026-11-24: "replace my review with thorough cysec and reliability and
  liability checks not my human review. also adversarial analysis."; "we
  don't want human in the loop"). Agent sessions merge their own PRs
  (`CLAUDE.md`, "Ship without review ceremony"). What used to need the owner's
  approval is now judged by required checks that always run main's copy of
  their code, never the PR's: a change to a gate is judged by the old gate.
  `.github/CODEOWNERS` remains the map of sensitive paths those checks review
  hardest. Background: `docs/security/agent-hardening.md`.
- **Six required checks**, each named so it is unique across workflows
  (`test` is a job in dozens of them) and each running on every PR, so none
  leaves an unrelated PR waiting on a check that never starts:
  `conflict-markers`, `control-plane` (this ruleset and the gate keep their
  invariants), `ci-policy` (workflow tiers and pinned actions), `risk-review`
  (cyber and legal checklist; blocks secrets and guardrail cuts),
  `security-scan` (pinned scanners; fails on findings a PR adds) and
  `adversarial-gate` (rules for how a rogue agent would attack the repo, plus
  an LLM red-team review of high-risk changes). The last two come from
  `.github/workflows/priv-security-gate.yml` (`pull_request_target`, base
  checkout only). `integration_id` 15368 is GitHub Actions, so no other app
  can post a passing status under these names.
- **Code scanning merge protection (CodeQL, medium or higher).** Owner,
  2026-11-24: fix new CodeQL findings "before they hit main". The
  `code_scanning` rule blocks a PR whose CodeQL results add a security alert
  of medium severity or worse, or any error-level alert.
  `.github/workflows/priv-codeql.yml` runs on every PR; its read-only
  `codeql gate (...)` jobs (`platform/ci/codeql_gate.py`) print the same
  findings in the job log for agent sessions, which cannot read alerts.
  Apply this rule only after `priv-codeql.yml` has completed one analysis on
  `main` (as of 2026-11-25 its runs on `main` were still being cancelled by
  back-to-back merges), or every PR waits for results that do not exist yet.
- **Not strict (no up-to-date requirement).** Many sessions merge concurrently;
  strict mode serialises them and re-runs CI on metered minutes.
- **Squash only, linear history.** Matches the auto-merge bot.
- **No bypass actors.** Until 2026-10-30 admins could bypass on PRs, so an agent
  pushing with the owner's admin token skipped every rule. If runners are
  starved (as on 2026-08-26) and a merge cannot wait, add the bypass by hand
  for that window and take it out again.

After applying it, open a test PR that adds a workflow with `permissions:
write-all` and confirm `adversarial-gate` blocks it and GitHub refuses the
merge. Nothing in this repository holds an admin token, so applying the file
stays a step for the owner.

Not covered by rulesets: fork-PR workflow approval and the default
`GITHUB_TOKEN` permission (Settings → Actions → General), environment
protection for publishing secrets (Settings → Environments), and
secret-scanning push protection (Settings → Code security). The checklist is in
`docs/security/agent-hardening.md`.
