# Rulesets

`main.json` is the intended `main` branch ruleset (live ruleset id 26239454).
GitHub does not read this file; an admin applies it:

```bash
gh api -X PUT repos/Duncan-Haywood/oss-monorepo/rulesets/26239454 --input .github/rulesets/main.json
```

Why it looks the way it does:

- **0 approvals, but Code Owner review on.** Agent sessions merge their own PRs
  (`CLAUDE.md`, "Ship without review ceremony"), so most PRs need no review.
  A PR touching a path in `.github/CODEOWNERS` (agent instructions, hooks, MCP
  config, CI, this ruleset) needs the owner's approval. Without that, any agent
  that can merge can rewrite what every later agent reads and runs.
  Background: `docs/security/agent-hardening.md`.
- **Stale approvals dismissed on push.** An owner approval covers the commit
  the owner saw; a push after it needs a fresh one.
- **Two required checks, `conflict-markers` and `control-plane`.** They are the
  only checks that run on every PR. Almost every other workflow is
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

Apply it after agents have their own non-admin identities
(`docs/security/agent-hardening.md`, step 1). Before that, a PR an agent opens
under the owner's account cannot get a Code Owner approval: GitHub does not let
the owner approve their own PR. After applying it, open a test PR that touches
`CLAUDE.md` and confirm GitHub asks for the Code Owner review.

Not covered by rulesets: fork-PR workflow approval and the default
`GITHUB_TOKEN` permission (Settings → Actions → General), environment
protection for publishing secrets (Settings → Environments), and
secret-scanning push protection (Settings → Code security). The checklist is in
`docs/security/agent-hardening.md`.
