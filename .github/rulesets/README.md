# Rulesets

`main.json` is the intended `main` branch ruleset (live ruleset id 26239454).
GitHub does not read this file; an admin applies it:

```bash
gh api -X PUT repos/Duncan-Haywood/oss-monorepo/rulesets/26239454 --input .github/rulesets/main.json
```

Why it looks the way it does:

- **0 approvals and no Code Owner review (since 2026-11-24).** The owner
  replaced his review with automated checks ("replace my review with thorough
  cysec and reliability and liability checks not my human review"). A PR
  touching a path in `.github/CODEOWNERS` is instead judged at the
  control-plane tier by `adversarial-gate`, which runs main's rules, never
  the PR's. Background: `docs/security/agent-hardening.md`, "The adversarial
  gate".
- **Stale approvals dismissed on push.** An owner approval covers the commit
  the owner saw; a push after it needs a fresh one.
- **Five required checks: `conflict-markers`, `control-plane`, `ci-policy`,
  `security-scan`, `adversarial-gate`.** They run on every PR (the last two
  from `priv-security-gate.yml` on `pull_request_target`, so the copy on
  `main` judges). Almost every other workflow is
  path-filtered, so requiring one would leave unrelated PRs waiting on a check
  that never starts. Job names are not unique across workflows (`test` is a
  job in 63 of them), which is why these jobs have their own names.
  `integration_id` 15368 is GitHub Actions.
- **Not strict (no up-to-date requirement).** Many sessions merge concurrently;
  strict mode serialises them and re-runs CI on metered minutes.
- **Squash only, linear history.** Matches the auto-merge bot.
- **No bypass actors.** Until 2026-10-30 admins could bypass on PRs, so an agent
  pushing with the owner's admin token skipped every rule. If runners are
  starved (as on 2026-08-26) and a merge cannot wait, add the bypass by hand
  for that window and take it out again.

Nothing in the repository applies this file (no workflow holds an admin
token, on purpose). With Code Owner review off, applying it no longer depends
on agents having their own identities. After applying it, open a test PR and
confirm `security-scan` and `adversarial-gate` appear as required checks.

Not covered by rulesets: fork-PR workflow approval and the default
`GITHUB_TOKEN` permission (Settings → Actions → General), environment
protection for publishing secrets (Settings → Environments), and
secret-scanning push protection (Settings → Code security). The checklist is in
`docs/security/agent-hardening.md`.
