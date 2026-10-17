# Actions Timeout Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for jobs with no job-level timeout-minutes (or one set to the 360-minute default) -- the jobs that can hang for six hours of runner time -- printing each with the worst-case billed minutes for its runner and the exact fix, browser or z…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-timeout-check@main
  with:
    path: .
```

Runs [`ventures/actions-timeout-check/check.py`](../../../../ventures/actions-timeout-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/actions-timeout-check/?ref=gh-action
