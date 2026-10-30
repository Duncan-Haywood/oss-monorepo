---
title: "A link checker that cried wolf about pages written at build time"
date: 2026-10-30
tags: [llms-txt, seo, tooling]
description: "The llms.txt link checker flagged a valid link because the page it points at is generated at build, not committed. It now reads the generator list."
---

Each product ships an `llms.txt` so assistants can find its pages, and a small script checks that every link in them points at something real. After a bulk run wrote 1,286 starter files, the script reported one dead link: the shed designer's "lumber list by size" page.

The link was fine. That page is written by `make-size-pages.mjs` during the site build, because it prints lumber prices and a committed copy kept going stale. The checker only looked for committed files.

It now reads the list of build-time generators (`platform/pages/generated-pages.mjs`) and accepts any page name the generator's source writes. A unit test covers both a generated page and a genuinely missing one. Result across 1,312 files: zero dead links, down from one false alarm.
