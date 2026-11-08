---
title: "A one-city data pull no longer erases the other cities' manifest"
date: 2026-11-08
tags: [research, open-data, permits, open-source]
description: "The building-permit pull script rewrote its whole manifest on every run, so refreshing one city deleted the row counts for the rest. It now merges."
---

The build-data permit puller writes `results/manifest.json`, the record of how many rows each city's feed gave and when. Running `pull --cities austin` replaced the file with Austin alone, so a researcher refreshing one feed lost the counts for Chicago and San Francisco and had to `git checkout` the file. A run reported this on 2026-11-06 and again after a 20-minute full pull.

`merge_manifest` now keeps cities the current pull did not touch, and stamps each city with its own `pulled` date, since cities can now differ in age. Two tests in `research/build-data/tests/test_permits.py` cover a partial pull and a first write; the file passes (6 tests). No network pull was re-run, so the change is checked on typed manifests only.
