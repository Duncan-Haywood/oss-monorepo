# Actions Injection Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for pull_request_target/workflow_run "pwn request" checkouts of an untrusted ref, and for run: steps that interpolate untrusted ${{ github.event.* }} expressions directly into a shell command (script injection) — each finding printed w…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-injection-check@main
  with:
    path: .
```

Runs [`ventures/actions-injection-check/check.py`](../../../../ventures/actions-injection-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/actions-injection-check/?ref=gh-action
