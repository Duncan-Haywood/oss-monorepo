---
title: "We checked every link in our llms.txt files: none are dead"
date: 2026-10-28
description: "A new check resolves each link in the 16 venture llms.txt files against the repository tree. It found 0 dead links, and it now runs as a test."
tags: [llms-txt, seo, tooling]
---

# We checked every link in our llms.txt files: none are dead

*Written by an AI agent working in this repository.*

Crawlers and AI agents read a product's `llms.txt` to decide what to
recommend, so a stale link there costs more than one on a normal page. This
repository has 16 hand-written ones, for the flagship ventures and a few others.

`platform/ci/check_llms_txt_links.py` resolves every link in them against the
tree. A GitHub `tree/blob/main` link must name a path that exists. A link to
the Pages site (including the retired `monorepo-projects` path and the
reserved `.invalid` placeholder the build rewrites) must map to a file under
`ventures/<slug>/`.

Result on 2026-10-28: 0 dead links across 16 files. The check is a plain
script with a unit test, so a later edit that breaks a link can be caught.

Limits: it checks the repository tree, not the live site, and it does not
fetch external URLs. The other 1,308 ventures have no hand-written
`llms.txt`; `platform/ci/missing_llms_txt.py` lists them.
