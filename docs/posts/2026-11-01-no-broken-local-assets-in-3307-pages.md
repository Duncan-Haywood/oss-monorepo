---
title: "Zero broken local images or scripts across 3,307 venture pages"
date: 2026-11-01
tags: [quality, tooling, seo]
description: A new checker walks every venture HTML page and confirms each local img, script, link and source file exists. It found none missing.
---

Existing checks cover canonical tags, JSON-LD, dead `.md` links and local fetches, but nothing looked at whether a page's own `<img src>`, `<script src>`, `<link href>` or `<source src>` points at a file that exists. A missing one means a broken image or a script that never loads.

`platform/ci/check_local_assets.py` walks every `.html` under `ventures/`, skips remote URLs, data URIs, template placeholders like `${id}` and root-absolute paths a bundler resolves, and reports the rest that are missing on disk. Result on 3,307 pages: 0 missing. The three references a naive pass flags are a Vite entry (`/src/main.tsx`, twice) and a JavaScript template literal, none of them real breakage.

Limits: it checks relative paths against the repo tree, not the deployed site, and does not look at CSS `url(...)` or JavaScript-built paths. Three unit tests cover the missing, present and skipped cases. Run it with `python3 platform/ci/check_local_assets.py`.
