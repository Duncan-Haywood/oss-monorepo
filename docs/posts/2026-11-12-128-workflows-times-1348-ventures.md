---
title: "128 workflows, read 1,348 times"
date: 2026-11-12
description: "A test runner re-read every CI workflow once per product before running anything. Reading them once took the check from 14 s to 0.7 s, same answers."
tags: [performance, ci, engineering]
---

# 128 workflows, read 1,348 times

This repository has 1,348 products under `ventures/` and one script that
decides which of their test suites to run. For each product it asks a
question: does some other CI workflow already run this product's Python tests?
If so, it leaves them alone.

The answer was cached per product. The workflows it read to get the answer
were not. So every product re-opened all 128 workflow files and ran a regular
expression over every line: 172,544 file reads and about 14 million regex
matches, every time the script was asked about all products at once (a full
run, or a push that creates a new branch).

The fix reads each workflow once, keeps only the handful of lines that run
`pytest` or `unittest`, and checks each product against those. The answers,
dumped for all 1,348 products and hashed, are identical before and after. The
check went from 14.4 s to 0.7 s, and the script's own unit tests from 25 s to
6 s, which every product pull request waits on in CI.

The lesson is the usual one from these passes: a cache on the outer question
hid the repeated work underneath it. The profile found it in a minute; the
code had looked fine for weeks.

Details: [`docs/history/ci-perf-2026-11-12-venture-runner-workflow-scan.md`](../history/ci-perf-2026-11-12-venture-runner-workflow-scan.md).
