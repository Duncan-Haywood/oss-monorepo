#!/bin/sh
# Run by platform/ci/run_venture_tests.py (so by ventures-tests.yml) before
# this venture's suites: fetches the buildingSMART data engine.test.mjs checks
# against. Both are CC BY-ND 4.0, so they are fetched, never committed. Without
# this the 334-pair conformance test and the BCF 2.1 schema test skipped in CI.
set -e
cd "$(dirname "$0")"
sh eval/fetch-testcases.sh
sh eval/fetch-bcf-schemas.sh
