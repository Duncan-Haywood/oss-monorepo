---
title: "Do our calculator pages fetch files that exist? A sweep of 1,300 pages"
seo_title: "Sweep: do pages fetch files that exist?"
date: 2026-10-29
tags: [engineering, ci]
description: "We scanned every venture page and script for relative fetch() calls and checked each target exists. none dangling, and a CI check to keep it so."
---

A calculator page that calls `fetch("./rates.json")` for a file nobody committed gets the host's 404 page back. The page then falls back or shows nothing, and the unit tests never notice because they import the engine and never load the page.

We swept every `.html`, `.js` and `.mjs` file under `ventures/` for literal `fetch()` targets. A rough first pass matched 13 candidates. Eight resolved to files that exist. The other five were server routes (`/v1/...`) or text that only looked like a call, so no page fetched a missing file.

The sweep is now `platform/ci/check_local_fetch.py`, with unit tests, run in the validate workflow. It only checks literal relative paths that have a file extension. Template-string and absolute URLs are skipped, so a dynamic path could still dangle.
