# Actions Schedule Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for schedule cron entries that are invalid, faster than GitHub''s 5-minute minimum, or set to minute 0 of the hour (when scheduled runs are most likely to be delayed), printing each with the fix, browser or zero-dependency CLI, no uplo…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-schedule-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `actions-schedule-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/actions-schedule-check/check.py`](../../../../ventures/actions-schedule-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/actions-schedule-check/?ref=gh-action
