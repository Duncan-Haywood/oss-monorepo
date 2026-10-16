# Actions Runtime Deprecation Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/actions-runtime-deprecation-check/>

A free, zero-dependency CLI that scans `.github/workflows/` for steps pinned to
a first-party `actions/*` version that runs on a deprecated or ageing Node
runtime:

1. **`shut-down-version`** — a major GitHub no longer serves
   (`upload-artifact`/`download-artifact` v1–v3, `cache` v1–v2). Jobs fail.
2. **`deprecated-runtime`** — Node 12 or 16, both end of life. GitHub warns
   and forces a newer runtime.
3. **`ageing-runtime`** — Node 20. Fine today; GitHub has announced moving the
   runner default to Node 24. Reported, never a failure.

Each finding names the file and line, the runtime, and the major to move to.

**What it is not:** it does not read `action.yml`, call the network, or cover
third-party actions. SHA-pinned and branch refs (`@main`) cannot be mapped to a
major and are skipped. The version-to-runtime table in `check.py` is a
snapshot (`TABLE_AS_OF`); confirm against the action's own `action.yml`
(`runs.using`) before acting. Upgrading a major can change inputs and
behaviour: read its release notes.

## Quickstart

```sh
python3 check.py                      # scan ./.github/workflows
python3 check.py /path/to/repo
python3 check.py --format json
python3 check.py --fail-on-risk       # exit 2 on shut-down / deprecated findings
```

As a CI gate, `--fail-on-risk` fails only on runtimes that are already end of
life; the Node 20 notices stay informational.

## Tests

```sh
python3 -m unittest test_check
```

MIT licensed. If it saved you a debugging session, a GitHub Sponsors donation
to the creator is welcome and never required.
