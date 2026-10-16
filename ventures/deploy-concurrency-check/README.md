# deploy-concurrency-check

Find the ways a GitHub Actions deploy workflow is permitted to apply an **older**
revision over a newer one.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/deploy-concurrency-check/

A deployment race does not fail. Both runs go green, the older one happens to
finish last, and what is left is a green check on the newer commit above a live
target running the older code. Nothing in either run's log says what happened,
because from inside each run nothing did.

Free, no sign-in, no account. Two ways to use it:

- **In the browser** — [open the tool](./index.html), paste a workflow. The scan
  runs on your device; nothing is uploaded and the page makes no network request
  at all once loaded.
- **In your CI** — `check.py`, Python standard library only, no dependencies, no
  network access, no GitHub token.

```
python3 check.py .github/workflows/                   # scan them all
python3 check.py .github/workflows/ --fail-on-risk    # exit 1 on a high-risk finding
python3 check.py deploy.yml --json                    # stable ids for your own tooling
```

## What it looks for

| id | risk | what it means |
|---|---|---|
| `no-concurrency` | high | A deploying job with no `concurrency:` at job or workflow level. Two pushes run at once and the one that finishes last is the one that is live. |
| `per-run-concurrency-group` | high | A group keyed on something that changes every run (`github.sha`, `github.run_id`, …). Every run lands in a group of its own, so nothing ever waits. Identical to having no block, except that the block reads as protection. |
| `cancel-in-progress-on-deploy` | medium | Correct for tests, wrong for a deploy: a cancelled deploy has already written part of its change and nothing re-runs to finish it. |
| `split-concurrency-group` | high | Two jobs, or two workflows, deploying the same `environment:` under different group names. A group only serializes runs that share it, so these do not serialize against each other. |
| `mutable-ref-checkout` | medium | A deploying job checking out a literal branch name. The branch resolves when the step runs, so a queued or re-run job can ship a different tree than the one it was queued for. |

Every finding names the file, the line, the job, why it matters in terms of what
someone would actually see, and the fix.

## What counts as a deploying job

Always stated in the output, never implied — a reader who cannot tell *why* a
job was treated as deploying cannot tell a true finding from a false one. A job
qualifies when it:

1. declares an `environment:`, or
2. runs a known deploy action (`actions/deploy-pages`, `peaceiris/actions-gh-pages`,
   `aws-actions/amazon-ecs-deploy-task-definition`, and others), or
3. is named for a deployment (`deploy`, `publish`, `release`, `promote`,
   `rollout`, `ship`) as a whole word — so `undeploy-docs` and
   `redeployment-notes` do not qualify.

## Limits

**This is evidence, not a determination.** It reads the YAML you give it. It
cannot know whether your deploy step is idempotent, whether the target has its
own locking, whether a deployment protection rule already serializes the
environment, or whether your team has decided a particular race is acceptable. A
clean report means none of the five patterns above were found — not that the
pipeline is safe.

It also only reads the files you point it at. A pipeline where something outside
this repository writes to the same target is outside what any workflow scan can
see.

## How the two implementations stay honest

`classify.mjs` holds the logic and `check.py` is a line-for-line port of it.
`classify.test.mjs` runs both over the same fixtures and asserts identical
findings and identical deploy-job detection, so the page and the CLI cannot
drift apart — a browser tool whose verdict disagrees with the CLI a team wired
into their pipeline is worse than either one alone.

Neither parses YAML with a library. Both use the same small indentation scan,
deliberately: a library would be a dependency in a page that promises to add no
script, font or network call, and two different YAML parsers' edge cases are far
harder to hold identical than one scan implemented twice.

## Development

```
node --test 'ventures/deploy-concurrency-check/**/*.test.mjs'
```

35 assertions. Roughly half of them assert the checker stays **quiet** — on a
correctly serialized deploy, on a test workflow that legitimately cancels in
progress, on a build job sitting beside a deploy job, on `github.ref` as a group
key, on job names that merely contain the substring "deploy". A scanner that
flags a correct file teaches its reader to stop reading findings, which costs
more than the findings are worth.

## Privacy

Nothing you paste leaves your device. No cookie, no third-party script, font or
analytics service, and no network request after load. The page keeps a local
count of how often the scan button is used, on your device only, and offers a
switch to turn that off which persists across visits.

## Licence and disclaimer

MIT (see `LICENSE`). Free and provided **as is, with no warranty** of any kind,
express or implied. Not a security audit, a compliance control, or professional
advice; no liability is accepted for any loss arising from its use or from a
deployment made after reading its output.

Not affiliated with, endorsed by, or sponsored by GitHub. "GitHub" and "GitHub
Actions" name the system whose workflow files this reads.

[Sponsoring is optional](https://github.com/sponsors/Duncan-Haywood) and changes
nothing about what the tool does.
