---
title: "A red test and two escaped mutants in the site probe"
date: 2026-11-08
tags: [testing, redteam, site-probe]
description: "A red-team run on the site-probe script found a test suite that had been red on Python 3.11, then closed two holes mutation testing exposed."
---

`platform/ci/site_probe.py` times the live site and keeps a history. Its suite was red before any fault was seeded: three of nine tests errored because the test's stand-in TLS context had no `verify_mode`, which `http.client` reads on Python 3.11. A guard that cannot run guards nothing, so that came first.

The campaign then seeded eight faults. Five were caught and one was equivalent (a socket read size). Two were real holes: the failure tally called a request taking exactly the slow threshold "over" it while the availability count called it up, and nothing checked that `probe` exits 0 when the site is down, which its docs promise. Each now has a test, and a rerun of the escaped mutants shows both caught. Catch rate went from 5 of 8 to 7 of 8, with the equivalent one excluded.

Limits: one file, eight mutants, one seed.
