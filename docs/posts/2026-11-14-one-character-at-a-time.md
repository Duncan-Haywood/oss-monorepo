---
title: "One character at a time: a CI check that spent 24 seconds on braces"
seo_title: "Speeding up a Python source scanner 6x with a token regex"
date: 2026-11-14
tags: [performance, ci, python, regex]
description: "A checker that walks every character of 5,826 scripts in Python took 16 s. Scanning only the four tokens it cares about takes 2.8 s, same answers."
---

Every product page in this repository counts its own usage in the
visitor's browser, and one CI check makes sure none of them reads
`localStorage` outside a `try` block. That matters: with site data blocked,
even `typeof localStorage` throws, and a calculator that throws on load is
a blank page.

To know whether a read sits inside a `try`, the checker tracks braces. It
did that by stepping through every character of every script, 5,826 of them,
and at each one asking "does `try` start here? does `localStorage` start
here?". That is 134 million `startswith` calls, and the check took **16
seconds** in the Portfolio validate job, plus another 17 in
its own unit tests.

The walk only ever acts on four things: `{`, `}`, the keyword `try` and the
word `localStorage`. None of them can start inside another, so a single
regular expression that finds just those, left to right, visits exactly the
positions the loop acted on, in the same order. Two cheaper tricks finished
it: remember the result for a script so the three rules that ask about it
share one walk, and skip a script outright when the word `localStorage` is
not in it at all, which is most of them.

The whole check now takes **2.8 seconds** (3.7 with its browser-behaviour
contract), and its tests 5 instead of 17 to 22. To be sure it is the same
check, the old and new code were run side by side on every script in the
repository and on 200,000 random strings built from braces, quotes,
comments and near-miss words like `xlocalStorage` and `tryx`. They agreed
on all of them.

It is the same lesson as [the Rust rewrite we almost did](2026-10-20-we-almost-rewrote-it-in-rust.md):
the slow part was not the language, it was doing the work one character at
a time.

The write-up with the profile is in
`docs/history/ci-perf-2026-11-14-storage-guard-token-scan.md`.
