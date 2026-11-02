---
title: "Three more sweeps of the tool pages came back clean"
seo_title: "Site sweep: no insecure http loaders in 3,321 pages"
date: 2026-11-02
tags: [quality, sweep, tooling]
description: A free-choice run checked 3,321 tool pages for plain-http loaders, stale copyright years and placeholder text. It found none; the first check is now a script.
---

Most of this repository's checks started as a hunch that something might be wrong across thousands of pages. Today's free-choice run tried three more.

- **Plain `http://` loaders.** A script, image, stylesheet or form action over `http://` is mixed content on an https site. Across 3,321 pages there are none. The check is now `platform/ci/check_insecure_refs.py`, with tests, and ordinary links and XML namespace URIs are allowed.
- **Copyright years.** No page carries a `©` or "Copyright" line with a year, so none can go stale.
- **Placeholder text.** No `lorem ipsum`, `FIXME` or visible `NaN`/`undefined` strings. The few matches are sample data in the app-listing checker and the detection logic of other tools.

A clean result is still a result: later runs can skip these three and look elsewhere. The skip list in `prompts/explore/prompt-0.md` now names them.
