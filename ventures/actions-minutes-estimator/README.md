# actions-minutes-estimator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/actions-minutes-estimator/>

**What will this GitHub Actions workflow cost you a month?**

A free browser tool and zero-dependency Node CLI that reads workflow YAML and
projects monthly billable minutes and dollar cost — per workflow, per job —
naming the patterns responsible.

- Browser: paste your files, nothing is uploaded.
- CLI: `node cli.mjs .github/workflows`, no network access used or required.
- CI gate: `node cli.mjs --max-allowance-percent 80 .github/workflows` exits 1
  when a change pushes projected usage past a share of your allowance.

## The problem

GitHub's billing page answers "how many minutes did this account spend?" It
does not answer either of the questions you actually have:

- **Which workflow spent them?** Billing aggregates across the account. The
  run-timing API (`/actions/runs/<id>/timing`) does not close the gap either —
  it reports a billable `total_ms` of 0 on private repositories often enough
  that no per-workflow attribution can be built on it.
- **What will this workflow cost before I merge it?** Nothing tells you. You
  find out a month later, or when jobs stop getting runners.

So this reads the workflow files and does the arithmetic forward.

## What it models

| | why it matters |
|---|---|
| Linux 1× / Windows 2× / macOS 10× | a ten-minute macOS suite spends 100 allowance minutes |
| per-job rounding, up to the whole minute | 30 matrix jobs of 20s bill 30 minutes, not 10 |
| matrix expansion, with `include`/`exclude` | GitHub's documented order, and it refuses past 256 jobs |
| `runs-on: ${{ matrix.os }}` per leg | each leg costed at its own multiplier, not averaged |
| larger runners | billed per minute, *outside* the included allowance |
| self-hosted | free |
| `cron` schedules | counted exactly, over a full reference year |
| `paths:` filters | a monorepo's per-package workflow does not fire on every push |
| missing `timeout-minutes` | the default is 360 minutes — 3,600 on macOS |
| `push` + `pull_request` with no branch filter | every PR commit built twice |
| missing `cancel-in-progress` | superseded runs bill in full |

## What it does not do

- **It does not read your billing page.** Nothing here has network access. The
  rates are GitHub's published list prices as of the date the report prints,
  and they change — check a figure against your own billing page before acting
  on it.
- **It cannot know how busy your repository is.** Push and pull-request
  frequency are assumptions you set. They are printed with every report,
  because an estimate whose premises you cannot see is not worth acting on.
  Only `cron` schedules are derived rather than assumed.
- **It refuses YAML it would have to guess at.** Anchors, aliases, merge keys
  and multi-document streams raise `UnsupportedYamlError` rather than being
  half-read. A file it cannot read is *named and skipped*, never silently
  dropped — a workflow missing from the total makes the bill look smaller,
  which is the one direction a cost tool must not be wrong in.

## Layout

| file | |
|---|---|
| `estimate.mjs` | the model: classification, matrix, cron, costing, findings |
| `workflow-yaml.mjs` | a small YAML reader scoped to the workflow subset |
| `cli.mjs` | terminal report, `--json`, and the CI budget gate |
| `index.html` | the browser tool — imports `estimate.mjs`, does not restate it |
| `how-github-actions-minutes-are-billed.html` | the explainer the tool links to |

The browser page **imports** the same module the CLI runs. It does not carry a
port of the arithmetic; two copies would drift, and the browser copy is the one
nobody would notice drifting.

## Tests

```bash
node --test ventures/actions-minutes-estimator/*.test.mjs
```

55 assertions across the YAML reader, the cost model and the CLI, plus 10 page
checks. The cron counter is pinned against known facts (261 weekdays in 2025,
the day-of-month/day-of-week OR rule), and the estimator is run end to end
against this repository's own `.github/workflows`.

## Measured on this repository

Run against this monorepo's own 218 workflows on 2026-09-11
(`--plan free --minutes-per-job 3 --pushes 60 --prs 40`), the single largest
line item was **`Claude routine trigger` at 2,194 runs a month — about 6,582
allowance minutes**, from one `*/20 * * * *` schedule: roughly 3× the Free
allowance from one cron.

**And that figure is an upper bound, not live spend — which is the more useful
half of the story.** Checked against `portfolio/ledger/asks.yaml`, the job
behind that schedule carries
`if: github.event_name == 'workflow_dispatch' || vars.ROUTINE_TRIGGER_ENABLED == 'true'`,
and the repository variable is unset. A skipped job is decided *before* a
runner is assigned, so it bills nothing today.

The first version of this tool did not model job-level `if:` and reported the
6,582 as though it were being spent. That is the failure mode this whole
repository keeps recording against itself — a correct reading of the files,
restated as a claim about the world — and it is why the estimator now counts
conditional jobs separately, reports `of which conditional` in the totals, and
raises an `info` finding naming the condition and saying the job may be
switched off entirely.

So what the tool establishes here is *attribution and a ceiling*: if that
variable is ever set to `true`, this one cron becomes 3× the Free allowance on
its own. It does not establish current spend, and no session here can — the
billing page is not reachable, and the sub-cause of a starvation window is not
knowable from a session (see `CLAUDE.md`).

## Licence and support

MIT (`LICENSE`). Free, with the full feature set — there is no paid tier.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.
