# Cross-agent pull request review

Four agent families work this repo: **GitHub Actions** (OpenCode / scheduled
workflows), **Kilo Code** (`kilo-code-bot[bot]`), **Cursor Cloud**
(`app/cursor`), and **Claude Code** (often pushes as the owner). Each can
*write* PRs but cannot approve its own — GitHub blocks self-review.

This directory wires **four reviewer GitHub Apps** that review each other's PRs
and auto-merge when **two** of them approve and CI is green.

## One-time owner setup

### 1. Create four GitHub Apps (free — no extra seats)

| App name | Suggested slug | Used as reviewer login |
|----------|----------------|------------------------|
| Portfolio reviewer GH | `portfolio-reviewer-gh` | `portfolio-reviewer-gh[bot]` |
| Portfolio reviewer Kilo | reuse Kilo's existing app OR new `portfolio-reviewer-kilo` | `kilo-code-bot[bot]` |
| Portfolio reviewer Cursor | reuse Cursor's app OR new `portfolio-reviewer-cursor` | `cursor[bot]` |
| Portfolio reviewer Claude | `portfolio-reviewer-claude` | `portfolio-reviewer-claude[bot]` |

For each App (Settings → Developer settings → GitHub Apps → New GitHub App):

- **Repository permissions:** Pull requests → Read & write; Contents → Read; Metadata → Read
- **Install** on `monorepo-projects` (only this repository)
- Note the **App ID** and generate a **private key** (.pem)

You need **two new Apps** at minimum (`portfolio-reviewer-gh` and
`portfolio-reviewer-claude`). For Kilo and Cursor you can either register new
reviewer-only Apps or reuse existing installations — if reusing, the App must
not be the PR author (Cursor Cloud PRs are authored by `app/cursor`; a
separate Cursor reviewer App is safest).

### 2. Add repository secrets

| Secret | Value |
|--------|--------|
| `AGENT_REVIEWER_GH_APP_ID` | App ID |
| `AGENT_REVIEWER_GH_PRIVATE_KEY` | Full PEM private key |
| `AGENT_REVIEWER_KILO_APP_ID` | App ID |
| `AGENT_REVIEWER_KILO_PRIVATE_KEY` | PEM |
| `AGENT_REVIEWER_CURSOR_APP_ID` | App ID |
| `AGENT_REVIEWER_CURSOR_PRIVATE_KEY` | PEM |
| `AGENT_REVIEWER_CLAUDE_APP_ID` | App ID |
| `AGENT_REVIEWER_CLAUDE_PRIVATE_KEY` | PEM |

Then add the repository **variable** (not a secret) `AGENT_REVIEW_ENABLED`
with the value `true`. Both workflows skip before taking a runner until it is
set, so the unconfigured scaffold no longer spends about 1,450 runs a day
doing nothing (`docs/reports/2026-10-30-ci-platform-evolution.md`).
`workflow_dispatch` of `agent-cross-review.yml` still runs without it.

### 3. Update the `main` ruleset

In **Settings → Rules → Rulesets → main**:

- `required_approving_review_count`: **2**
- Keep `require_last_push_approval`: **on**
- Do **not** add reviewer Apps to the bypass list (they should go through review like everyone else)
- **Require status checks (strongly recommended).** Under *Require status checks
  to pass* add the CI checks every code PR runs: `build`, `validate`, `check`,
  `test`, and `gitops`. Turn on *Require branches to be up to date before
  merging*. Without this, the ruleset gates only on **approvals**, so any
  actor — an agent session merging its own PR, or the auto-merge bot — can merge a PR whose slow checks (`build`,
  `validate`) have not finished. That is not hypothetical: on 2026-09-03 a
  ventures PR was merged after its fast checks were green but before `build`
  ran, landing a red `platform/pages` suite on `main`. Required status checks
  are what make GitHub itself refuse such a merge. `review.py` also gates on
  `mergeable_state` as defense-in-depth (see `mergeable_state_ok`), but that
  only covers the auto-merge path; the ruleset covers every merge.

Copilot code review does **not** count toward required approvals.

## How it runs

1. **`agent-cross-review.yml`** — on every non-draft PR push, four parallel jobs
   each post a review from their App (skipping PRs they authored).
2. **`agent-pr-auto-merge.yml`** — after reviews or CI completes, squash-merges
   when `config.yaml`'s `required_approvals` (default **2**) allowed bot
   approvals exist and checks pass.
3. **Agent sessions** — before new work, run review pending PRs (see
   `.github/prompts/review-open-prs-first.md`). The session that opened a PR
   still merges it itself (`.github/prompts/land-your-work.md`). Auto-merge
   is a backstop for any same-repo PR, `ventures/*` included (the venture
   exclusion was removed on 2026-10-20 at the owner's request).

## Local commands

```bash
# Review one PR as a reviewer App (GH_TOKEN must be that App's installation token):
python3 platform/ci/agent_review/review.py --reviewer cursor --pr 818

# Session start: review up to 5 open PRs missing this reviewer's approval:
python3 platform/ci/agent_review/review_pending.py --reviewer claude --max 5

# Check auto-merge eligibility:
python3 platform/ci/agent_review/review.py --check-merge-eligible --pr 818
```

## Configuration

Edit `config.yaml` to change the approval threshold, reviewer logins, or which
authors each reviewer skips.
