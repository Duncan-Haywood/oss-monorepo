# Actions Self Hosted Exposure Check (GitHub Action)

Free, read-only checker that scans a repository's GitHub Actions workflow files and flags every job running on a `self-hosted` runner label inside a workflow triggered by `pull_request`, `pull_request_target`, `workflow_run`, or `issue_comment` -- GitHub's own documented reason not to use self-host…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-self-hosted-exposure-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `actions-self-hosted-exposure-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/actions-self-hosted-exposure-check/check.py`](../../../../ventures/actions-self-hosted-exposure-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/actions-self-hosted-exposure-check/?ref=gh-action
