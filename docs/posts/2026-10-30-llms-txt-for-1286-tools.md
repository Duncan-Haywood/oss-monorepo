---
title: "1,286 tools now have an llms.txt, written from what each page already says"
date: 2026-10-30
tags: [aeo, llms-txt, seo]
description: "Only 22 of 1,327 tools shipped an llms.txt. A small script now builds one from each page's own title and description, so assistants get a plain summary without anyone inventing claims."
---

Answer engines read a plain-text `llms.txt` to learn what a site's pages are for. Of the 1,327 tool folders in this repository, 1,305 had none; the 22 that did were written by hand.

`platform/ci/gen_llms_txt.py` builds one from what a tool's page already says: the `h1`, the meta description, any other pages in the folder, and a link to the source. It never overwrites a hand-written file, and a page with no description gets no file rather than a made-up one. Of 1,305 missing, 1,286 were written; 19 have no page or description.

The link checker (`check_llms_txt_links.py`) passes for every new file. It does flag one old dead link in `shed-designer`, which predates this change. No ranking or citation change is claimed; whether assistants use these files is unmeasured.
