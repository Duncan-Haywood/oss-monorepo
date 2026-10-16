# Actions checkout credentials check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/actions-checkout-credentials-check/>

A free, zero-dependency CLI that scans GitHub Actions workflow files for
`actions/checkout` steps that leave the job's `GITHUB_TOKEN` in `.git/config`
(no `persist-credentials: false`).

- **`checkout-persists-credentials-with-upload`** — the same job also runs
  `actions/upload-artifact` or `actions/cache`, so the workspace is being
  exported. This is the "artipacked" pattern and the one worth fixing first.
- **`checkout-persists-credentials`** — the token sits on disk for every later
  step, including third-party actions. Lower risk; needed only if the job
  itself runs `git push`.

## Quickstart

```sh
python3 check.py                    # scan ./.github/workflows
python3 check.py /path/to/repo --format json
python3 check.py --fail-on-risk     # exit 2 if anything is found (for CI)
```

Tests: `python3 -m unittest test_check`; `node --test 'ventures/actions-checkout-credentials-check/*.test.mjs'` for the page.

## What it is not

A line-oriented static scan, not a YAML parser or a security audit. It makes
no network calls, uploads nothing, and cannot know whether a job really needs
the credential to push, so a finding is a prompt to look, not a verdict. It
reads one pattern only; it is not a substitute for a full workflow linter such
as zizmor. Informational tool: no legal, security or compliance advice, and
no warranty (MIT, see `LICENSE`).

## Browser version

`index.html` runs the same scan in the page (`check.mjs`, a line-for-line port
pinned to `check.py` by a parity test): paste workflow YAML, get findings and
the fix. Nothing is uploaded and there are no network calls.

## Usage tracking

The page counts two anonymous events (`check_run`, `example_loaded`) in the
visitor's own local storage only, honours Do Not Track / Global Privacy
Control, and has a button that turns counting off. The CLI collects nothing.

## Support

Free and MIT-licensed. Optional: GitHub Sponsors on the repository.
