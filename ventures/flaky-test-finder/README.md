# Flaky Test Finder

A free tool that classifies tests as **flaky**, **broken**, or **stable**
from two or more JUnit-XML test reports — the format pytest, Jest (via
jest-junit), Go (via go-junit-report), PHPUnit, RSpec (via
RSpecJUnitFormatter), and Maven/Gradle Surefire/Failsafe all produce.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/flaky-test-finder/

**What it is not:** a debugger, a root-cause finder, or a fix. It answers
one narrow question — did this test flip between pass and fail across the
runs you gave it — deterministically, from the reports themselves, with no
model and no guessing.

After using this, you can now **tell which failing test is a real
regression and which one is just flaky in one paste**, which used to take
**rerunning the suite by hand, eyeballing two console logs, and still
guessing wrong about which test actually flipped**.

## Why this exists

A red CI check with a mix of real regressions and flaky tests wastes time
in both directions: bisecting a commit that did nothing wrong because the
failure was flaky, and "just rerun it" reflexively waving through a test
that is actually broken every time. The fix for both mistakes is the same
fact, read mechanically instead of guessed: does this specific test's
pass/fail flip across runs, or not.

The most common real-world shape is handled directly: a CI job that only
reruns the tests that failed the first time (`pytest --lf`, `jest
--onlyFailures`, most "retry failed tests" CI features) legitimately
produces a second report containing a strict subset of the first report's
tests. That is not a missing test — it is the retry — and this tool counts
it as such rather than requiring every test to appear in every run.

## Try it without installing anything

[`index.html`](index.html) parses JUnit XML entirely in the browser — paste
two or more reports, click, get a verdict per test. No fetch happens from
the page itself, so nothing you paste ever leaves your device.

## Quickstart (CLI)

```sh
python3 check.py run1.xml run2.xml run3.xml   # exits 1 if any test is flaky
python3 check.py --glob "reports/*.xml"        # or glob a directory of reports
python3 check.py run1.xml run2.xml --json      # machine-readable
```

Zero dependencies — stdlib only (`xml.etree.ElementTree`), one file, nothing
to install, no network call.

## Disclaimers

This tool answers one question: did a test's pass/fail outcome flip across
the runs it was given. It does **not** tell you *why* a test is flaky —
see [why-are-my-tests-flaky-in-ci.html](why-are-my-tests-flaky-in-ci.html)
for the common causes to check once you know which test to look at. Verify
its output before relying on it, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`, `run_added`) in `localStorage` only — never transmitted,
never tied to a repo, a run, or test contents. Do Not Track and Global
Privacy Control are honoured, and a button on the page turns it off
entirely. The CLI records nothing and makes no network call.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Classification logic
and its test suite are duplicated deliberately between `check.py` (the
canonical CLI, using Python's stdlib XML parser) and `classify.mjs` (a
hand-rolled parser so the same logic runs in a browser with no DOMParser
dependency and no build step) — the two test suites assert the same cases
so a visitor gets the same verdict from either. No external user contact
has happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
