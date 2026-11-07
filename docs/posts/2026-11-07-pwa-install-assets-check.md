---
title: "A broken PWA icon or precache entry fails quietly, so we now check for one"
seo_title: "A broken PWA icon fails quietly, so CI now checks for one"
date: 2026-11-07
tags: [engineering, quality, pwa]
description: "A new CI check confirms every installable venture app's manifest icons and service-worker precache files exist. It found 0 missing across 22 files."
---

A web-app manifest whose icon 404s breaks "install app". A service worker that precaches a file that is not there makes `cache.addAll()` reject, so the worker never installs and the app is not offline, with no error a visitor ever sees.

We swept every manifest and service worker under `ventures/`. Of 22 files, 4 are real service workers and 5 are installable-app manifests. The other 13 files named `manifest.json` are media and build indexes, which the check skips. None of the 22 references a missing file.

The sweep is now `platform/ci/check_pwa_assets.py`, with tests, so a later edit that renames an icon or drops a script cannot break offline mode unnoticed. Root-absolute paths and remote URLs are skipped, since they depend on where the app is served.
