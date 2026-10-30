# Rulesets

`main.json` is the intended `main` branch ruleset (live ruleset id 26239454).
GitHub does not read this file; an admin applies it:

```bash
gh api -X PUT repos/Duncan-Haywood/oss-monorepo/rulesets/26239454 --input .github/rulesets/main.json
```

Why it looks the way it does:

- **0 approvals.** Agent sessions merge their own PRs (`CLAUDE.md`, "Ship
  without review ceremony"); a required approval count would block that.
- **One required check, `conflict-markers`.** It is the only check that runs on
  every PR. Almost every other workflow is path-filtered, so requiring one would
  leave unrelated PRs waiting on a check that never starts. Job names are not
  unique across workflows (`test` is a job in 63 of them), which is why this
  job has its own name. `integration_id` 15368 is GitHub Actions.
- **Not strict (no up-to-date requirement).** Many sessions merge concurrently;
  strict mode serialises them and re-runs CI on metered minutes.
- **Squash only, linear history.** Matches the auto-merge bot.
- **Admin bypass on PRs.** Runners have been starved before (2026-08-26); a
  required check with no runner blocks every merge. Remove the bypass actor if
  you would rather block than let an admin-scoped token merge past the check.

Not covered by rulesets: fork-PR workflow approval and the default
`GITHUB_TOKEN` permission (Settings → Actions → General), and secret-scanning
push protection (Settings → Code security).
