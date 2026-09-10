# Actions Self-Hosted Exposure Check

A free tool that scans GitHub Actions workflow files and flags every job
running on a `self-hosted` runner label inside a workflow triggered by
`pull_request`, `pull_request_target`, `workflow_run`, or `issue_comment` —
GitHub's own documented reason not to use self-hosted runners on a public
repository, and the same category of risk the OpenSSF Scorecard project's
`Dangerous-Workflow` check flags on public repositories, not a novel claim.

After using this, you can now **find every self-hosted job a fork can
influence across a whole repository in one paste**, which used to take
**opening each workflow file by hand and reasoning about which trigger
handed a stranger control over what the runner executes**.

**What it is not:** a security audit, a compliance attestation, or a
guarantee that your self-hosted infrastructure is safe. It answers one
narrow question — does this job run on the literal `self-hosted` label in a
workflow triggered by one of four documented risky events — and it does not
know whether your repository is actually public, whether required-approval
settings are already on, or whether a named runner group is actually
self-hosted.

## Why this exists

A workflow triggered by plain `pull_request` runs the workflow file **as it
exists on the pull request's own branch**, not your base branch. If a job in
that workflow runs on a `self-hosted` label, the pull request's author
controls the steps that execute on your runner machine — not you.
`pull_request_target`, `workflow_run`, and `issue_comment` always run the
base branch's own workflow file instead, so a fork cannot rewrite the steps,
but they still respond to fork-influenced input (often with secrets
available), and a self-hosted job that also builds fork content still runs
that code on infrastructure you own rather than an ephemeral GitHub-hosted
VM.

## Why there is no automatic detection of your repository's actual visibility

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own. It cannot check whether your
repository is public, whether "Fork pull request workflows" approval is
already required, or whether a `runs-on: {group: ...}` selection actually
resolves to a self-hosted group — those all need either a GitHub API call
or organization-level context this tool deliberately never touches. A
`fork-exposed` finding is a prompt to go verify those settings yourself, not
a claim that you are definitely compromised.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a browser
page. Paste the contents of one or more files from `.github/workflows/` and
get every job that matches — nothing is uploaded, and the page itself makes
no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any fork-exposed job is found
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-risk` into your own CI to block a newly-added
fork-exposed job before it merges.

## Classification

- `fork-exposed` — `runs-on:` includes the literal label `self-hosted`, and
  the workflow's trigger includes `pull_request`, `pull_request_target`,
  `workflow_run`, or `issue_comment`. Flagged.
- `self-hosted-other-trigger` — self-hosted, but the trigger is not one of
  the four above. Not flagged by this tool.
- `github-hosted` — `runs-on:` does not include the literal label
  `self-hosted`. Not flagged.
- `runner-group` — `runs-on:` selects an organization runner group by name.
  Cannot tell whether that group is self-hosted from the workflow file
  alone. Disclosed as unknown, not flagged.
- `dynamic` — `runs-on:` is a `${{ }}` expression (typically a matrix).
  Cannot classify statically. Disclosed as unknown, not flagged.
- `no-runs-on` / `no-jobs` — nothing this tool could find to classify.

## Disclaimers

This tool answers one question: does a job run on the literal `self-hosted`
label in a workflow triggered by one of four documented risky events. It
does **not** know your repository's actual visibility or approval settings,
and a clean scan is not a security or compliance claim about your
repository. Verify its output before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
a repository, a workflow, or a token. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns it off entirely. The
CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces byte-identical findings on
the same fixture, so the CLI and the page can never silently disagree about
what a line means.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like its siblings
[`actions-permissions-check`](../actions-permissions-check/),
[`actions-injection-check`](../actions-injection-check/),
[`actions-cache-poisoning-check`](../actions-cache-poisoning-check/), and
[`pinned-actions-check`](../pinned-actions-check/), this is a direct
graduation of an already-obvious, low-risk dev-tool idea. No external user
contact has happened yet — that is the next, non-code step (see
`kill_criteria` in `VENTURE.yaml`).
