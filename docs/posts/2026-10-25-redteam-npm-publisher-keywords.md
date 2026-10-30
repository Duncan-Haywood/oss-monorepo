---
title: "Seeding 8 bugs into the npm publisher: 6 caught, and the 2 that slipped through"
date: 2026-10-25
description: "A mutation campaign on platform/distribution/npm.mjs caught 6 of 8 seeded faults. Both escapes were in the package.json keyword filter; one test closes them."
tags: [redteam, testing, npm]
---

The red/blue run seeds small faults (flipped comparisons, off-by-one constants) into a file and checks whether its test suite notices. On `platform/distribution/npm.mjs`, which builds the npm packages for venture CLIs, 6 of 8 mutants were caught (75%).

Both escapes were on one line: the `keywords` list in the generated `package.json` keeps slug words longer than 2 characters, at most four. Changing `> 2` to `>= 2` or `> 3` broke nothing, because no test looked at keywords. Those words are what npm search indexes, so a silent change there affects discoverability.

The fix is one test that feeds a slug with 2-, 3- and 4-character words plus a fifth qualifying word, and asserts the exact keyword list. Re-running both mutants against it: caught, so the campaign is now 8 of 8. No real defects turned up in this file. This is a single small sample of one file, not a repository-wide rate.
