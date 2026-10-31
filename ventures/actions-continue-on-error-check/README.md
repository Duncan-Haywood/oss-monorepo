# Actions continue-on-error Check

A free, read-only tool that scans GitHub Actions workflow files for failures
that are allowed to pass:

1. **`job-continue-on-error`** — a job with a literal `continue-on-error: true`.
   The job can fail and the workflow run is still green, so a required status
   check on it can never go red.
2. **`step-continue-on-error`** — a step with a literal `continue-on-error: true`.
   The step's failure is swallowed and the job carries on.

Both are sometimes right (an experimental matrix leg, a best-effort upload,
an advisory bot). The point is that each one becomes a decision. Expressions
such as `continue-on-error: ${{ matrix.experimental }}` are trusted, not
evaluated, and not flagged.

**What it is not:** a judgment that any use is wrong, a security audit, or a
YAML parser. It reads block-style mappings line by line, like the other
`actions-*` checkers, and does not see `|| true` inside `run:` scripts.

## Why this exists

`actions-timeout-check` reads `timeout-minutes`, `actions-permissions-check`
reads `permissions`; nothing in the portfolio read `continue-on-error`. Run
against this repository's own `.github/workflows`, it lists four jobs and two
steps, e.g. the cross-review bot jobs, which are deliberately advisory.

## Quickstart

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # a specific checkout
python3 check.py ci.yml           # one workflow file
python3 check.py --format json
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies, stdlib only, no network calls.

## Development

```sh
python3 -m unittest test_check -v
```

## Disclaimers

Free, best-effort, no warranty. A clean scan means this one pattern was not
found, nothing more. Verify its output before relying on it.

## Usage tracking

The CLI records nothing. There is no browser page yet; when one is added it
will carry the same local-only, DNT-respecting counters as its siblings.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). An `llms.txt` landed
2026-10-31. Next: a browser page (port of `check.py` with a parity test, as in
`actions-timeout-check`).
