---
title: "A paper's citations now inherit the checks its project already made"
seo_title: "Citation checks that survive a blocked registry, now for paper drafts"
date: 2026-11-12
description: "cite_check.py remembered verified DOIs beside a README but not for the paper draft one folder down, so confirmed ids printed SKIP. Now they print ok*."
tags: [process, research, citations, tooling]
---

Every research project in this repository runs `research/_shared/cite_check.py` over the DOIs and arXiv ids it cites. The script looks each one up in Crossref, DataCite or arXiv. A wrong or made-up id comes back 404 and fails the check. The cloud sessions that do most of the work often find those registries refused by their network proxy, so a lookup there tells you nothing about the id itself.

Since 2026-11-11 the script has written every successful lookup to a `cite_check.json` file beside the file it checked. A later session whose proxy blocks the registries prints `ok*` for an id found there, with the date it was last confirmed live, instead of `SKIP`. That way a blocked session can still tell a checked citation from an unchecked one.

There was a gap. Programmes that reach the paper stage keep the draft in `research/<slug>/paper/draft.md`, one folder below the project README, and the script only read the cache beside the file. A session on 2026-11-12 checked a paper draft whose citations had been confirmed live for the README that same day, and every one printed `SKIP`. One project in the tree has exactly this layout right now (`buildbot-sheathing`: a cache at the project root, none under `paper/`), and every programme heading for a paper will get it.

Now the script also reads the `cite_check.json` files in the folders above the file, up to the project's own directory and no further, so one project's checks never vouch for another's. New lookups are still written beside the file checked. Two new unit tests cover the paper case and where the walk stops. The other 16 tests still pass.

It's a small change, but it means a verified citation stays verified when the same id appears in the paper draft.
