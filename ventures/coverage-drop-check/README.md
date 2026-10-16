# Coverage Drop Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/coverage-drop-check/>

A free tool that compares two **Cobertura** or **JaCoCo** coverage XML
reports — baseline vs this pull request — and tells you whether line
coverage dropped, and which files moved.

**What it is not:** a coverage runner, a quality score, or a substitute
for reading the diff. It answers one narrow question — did the line rate
go down between these two reports, and where — deterministically, from
the files themselves, with no model and no guessing.

After using this, you can now **fail a PR that dropped coverage from 92%
to 81% even though both numbers are "above 80"**, which used to take
**uploading reports to Codecov/Coveralls or eyeballing two HTML reports
and still missing the file that actually moved**.

## Why this exists

`--cov-fail-under=80` (and every other floor) lets a pull request walk
coverage down one point at a time as long as it stays above the
threshold. Codecov and Coveralls will catch a delta, but they need an
account, a token, and an upload of the report. The reports themselves
already contain the answer.

The first visitor this is aimed at is a developer who has already
searched Stack Overflow for "fail the build if code coverage decreases"
or "codecov alternative without uploading", and who already has
`coverage.xml` or `jacoco.xml` in CI artifacts from main and from the
PR.

## Try it without installing anything

[`index.html`](index.html) parses Cobertura and JaCoCo XML entirely in
the browser — paste two reports, click, get a verdict plus the files
that dropped, improved, appeared, or disappeared. No fetch happens from
the page itself, so nothing you paste ever leaves your device.

## Quickstart (CLI)

```sh
python3 check.py baseline.xml current.xml            # exits 1 if coverage dropped
python3 check.py baseline.xml current.xml --max-drop 0.5
python3 check.py baseline.xml current.xml --json
```

Zero dependencies — stdlib only (`xml.etree.ElementTree`), one file,
nothing to install, no network call.

## Disclaimers

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a quality judgement of your code
and it does not replace reading the diff. **You are responsible for
reviewing and verifying its output before relying on it.** To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, run `check.py` yourself.

See [why-did-my-pr-drop-coverage.html](why-did-my-pr-drop-coverage.html)
for the common reasons a PR lowers the number without deleting tests.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied
to a repo or to report contents. Do Not Track and Global Privacy Control
are honoured, and a button on the page turns it off entirely. The CLI
records nothing and makes no network call.

## Development

```sh
python3 -m unittest test_check -v
node --test compare.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Comparison logic
is duplicated deliberately between `check.py` (the CLI) and
`compare.mjs` (the browser), with matching tests, so a visitor who
checks the same reports both ways gets the same verdict.
