# Actions Artifact Poisoning Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for a workflow_run-triggered job that downloads an artifact (actions/download-artifact or dawidd6/action-download-artifact) and later executes something from it, and for a download-artifact step with no name: input -- the "artifact poi…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-artifact-poisoning-check@main
  with:
    path: .
```

Runs [`ventures/actions-artifact-poisoning-check/check.py`](../../../../ventures/actions-artifact-poisoning-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/actions-artifact-poisoning-check/?ref=gh-action
