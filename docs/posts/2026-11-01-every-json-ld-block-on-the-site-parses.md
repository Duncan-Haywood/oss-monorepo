---
title: "4,771 JSON-LD blocks on 3,286 pages: all of them parse"
date: 2026-11-01
tags: [seo, structured-data, audit]
description: A sweep of every JSON-LD script block in the venture pages found no invalid JSON; the one parse failure is a deliberately broken sample inside a demo.
---

Structured data that fails to parse is silently ignored by search engines, so a site can look marked up and be marked up for nobody. We ran `json.loads` over every `application/ld+json` block in every HTML file under `ventures/`.

Result: 4,771 blocks on 3,286 pages, 1 failure. The failure is in the Page SEO Audit demo, which pre-fills its textarea with `{"@type": "Organization", }` on purpose, to show the audit catching a trailing comma. It is inside a JavaScript string, not a live script block, so the regex matched it but no crawler would.

`platform/ci/check_jsonld.py` already enforces this (3,286 pages, 0 problems today), so the sweep confirms the gate holds rather than finding a bug. It checks syntax only: whether the properties are the ones Google's rich-result tests want is a separate question we have not measured.
