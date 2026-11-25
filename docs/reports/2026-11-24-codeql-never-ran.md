---
kind: note
topics: [security-alerts, ci, software-for-routine]
date: 2026-11-24
---
# CodeQL never ran; the security queue was empty by construction

Date: 2026-11-24. Track: process. Owner request: patch CodeQL findings "as
soon as they arise", clear the outstanding ones, and "fix new ones before they
hit main".

## What was found

- `.github/workflows/security-alert-queue.yml` ran 581 times (2026-10-30 to
  2026-11-24), every run green. Every run logged
  `::warning::code-scanning alerts unreadable (HTTP 404); queue left as is`
  (run 45314411885, job 138177668823 is the latest).
- The 404 is the alerts API saying there is no analysis. The repository has no
  CodeQL workflow and no default setup: `list_workflows` shows only the
  Dependabot, Copilot and Pages dynamic workflows, and nothing in `.github/`
  uploads SARIF.
- So the `security-alerts` branch was never created, and `prompt.md` step 0
  read "couldn't find remote ref" as "the queue is empty". The process that
  was meant to put security first had no input.
- **19 sessions saw the symptom and documented it away.** Between 2026-10-31
  and 2026-11-04, 19 PRs were titled some version of "prompt.md step 0
  tolerates a missing security-alerts branch" (GitHub search,
  `"security-alerts branch" in:title`). 16 were closed, 3 are still open
  (Duncan-Haywood/oss-monorepo PRs 12885, 12939, 12975). None asked why the
  branch was missing. The wording that landed ("the queue is empty") is the
  one this change replaces. This PR supersedes the three open ones.
- The capacity was already there. Four hourly schedules ("1"–"4") run
  `prompt.md`, about 96 sessions a day, and step 0 already sends each one to
  the queue before any other work.

## What changed

| Piece | File | Effect |
|---|---|---|
| CodeQL analysis | `.github/workflows/codeql.yml`, `.github/codeql/codeql-config.yml` | Actions, JS/TS, Python; every PR, every merge to main, weekly; default (high-precision) suite; vendored code excluded |
| PR gate | `platform/ci/codeql_gate.py` (+ tests) | fails a PR when a medium+ finding (security-severity ≥ 4.0, or an unscored error) sits on a line the PR adds or changes; prints rule, file:line and message to the job log, which agents can read |
| GitHub-side gate | `.github/rulesets/main.json` | `code_scanning` rule: CodeQL, security alerts medium or higher, errors |
| Loud outage | `platform/ci/security_alerts.py` (+ tests), `security-alert-queue.yml` | an unreadable API marks `QUEUE.md` `Unavailable:`, keeps the last alert files, commits that, and fails the job |
| Allocation | `prompt.md` step 0, `.github/prompts/verify-and-merge.md` | the queue comes before ideas, requests and routing until empty; a red `codeql (...)` job on your own PR is fixed in that PR, never suppressed |
| Policy | `docs/security/policies/vulnerability-management.md` | who fixes, when, and the gate |

The workflow, ruleset and agent-instruction files are in `.github/CODEOWNERS`,
so that PR waits for the owner's approval. The scripts and docs merge on their own.

## What the next run needs to know

1. **The backlog, measured.** The first CodeQL run (on PR 18529, merge commit
   of e2988dfb5; ~14 min per language) found **977 medium-or-worse findings**:
   0 in Actions workflows, 21 in Python, 956 in JS/TS. It also hit 1 Python
   parse error (`research/eda-smtbmc/experiments/wordlevel.py`, not analysed).
   Most are a few rules repeated: `bad-tag-filter`,
   `incomplete-multi-character-sanitization`, `incomplete-sanitization` and
   `incomplete-url-substring-sanitization` in build scripts, tests and the HTML
   linters under `platform/ci/`. Python: 12 `py/bad-tag-filter`, 2
   `incomplete-url-substring-sanitization` (both in tests), 1 `insecure-protocol`
   (`platform/ci/site_probe.py:112`), 1 `redos`
   (`ventures/jwt-verification-misuse-check/check.py:169`), 5
   `overly-large-range` (`platform/ci/check_hidden_unicode.py:94`). Many are in
   code no attacker input reaches (tests, build-time linters). The policy lets
   those be lowered one level, with the reason written down. They still get
   fixed, but code that handles user input or ships to the site comes first.
   Each alert file now tells a session to fix every queued alert in the same
   file together.
2. **Apply the `code_scanning` ruleset rule only after that first analysis**
   (`.github/rulesets/README.md`). Applied earlier, every PR waits for results
   that do not exist yet.
3. **Pace.** At one batched file per session and about 96 sessions a day,
   977 alerts should take days, not weeks. Do not switch on
   `security-extended` until the queue is below 10.
4. **Not covered:** Go (one oracle in `ventures/dockerignore-explainer/oracle`;
   CodeQL Go needs a build), Dependabot and secret-scanning alerts (a workflow
   token cannot read them).
5. **Runner time.** Three CodeQL jobs per PR on public-repo runners cost no
   money, but they add queue pressure. If `ci_starvation.py` starts flagging
   CodeQL, add path filters for docs-only PRs. Do not drop the gate.
