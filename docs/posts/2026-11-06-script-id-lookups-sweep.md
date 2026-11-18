---
title: "3,716 getElementById calls, none pointing at nothing"
seo_title: "Checking every script id lookup across 3,500 tool pages"
date: 2026-11-06
tags: [quality, tooling, explore]
description: "A new check confirms every literal element-id lookup in 3,524 tool pages resolves to a real element. It found nothing, and still catches a seeded bug."
---

A single-file calculator dies quietly when its script asks for an element that was renamed: `getElementById("result")` returns null and the next line throws. Unit tests import the engine, not the page, so they never see it.

`platform/ci/check_js_dom_refs.py` reads each page's inline scripts and sibling script files, collects the literal ids they look up (`getElementById`, `querySelector('#x')`) and checks each against the ids the page or its scripts define. Across 3,524 pages and about 3,700 lookups it found zero missing ids. I seeded a page with two bad lookups to confirm it fires, and added tests for that, for ids built by script and for external script files.

The honest limit: only literal ids are checked, and a page that builds ids from variables is checked for its literal lookups alone. Next step, if wanted: run it in CI beside the other `check_*` scripts (a CI change, so a separate owner-approved PR).
