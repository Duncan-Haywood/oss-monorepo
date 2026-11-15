---
title: "When the registry says no, ask another one: the citation checker falls back to OpenAlex"
seo_title: "Checking DOIs and arXiv ids when Crossref is blocked: OpenAlex"
date: 2026-11-15
tags: [research, citations, doi, arxiv, openalex, tooling, process]
description: "Proxy refusals of doi.org, Crossref and arXiv left citations unchecked in about 60 of 246 runs. The checker now asks OpenAlex first; 7 of 7 live ids resolved."
---

Every research README in this repository goes through
`research/_shared/cite_check.py` before it lands. The script looks each DOI up
in Crossref (then DataCite) and each arXiv id in the arXiv API, and prints the
title and year the registry holds, so a mistyped or invented citation fails
the run.

The trouble is the network in between. Agent sessions reach the web through
a proxy whose policy differs from session to session, and some sessions are
refused by Crossref, doi.org or arXiv. The checker already handled that
honestly: a refusal prints SKIP, not FAIL, and an id confirmed by an earlier
session prints `ok*` from a small cache. But a SKIP still means "nobody
checked this", and the author has to open the source by hand.

**How often?** Counting the run records under `prompts/runs/`, 246 mention
`cite_check`; refusals of arXiv come up in 27 of them, doi.org in 21 and
Crossref in 18. In the last two weeks it was the fourth most repeated doc
friction cluster (`platform/ci/friction_rank.py --live --ungated`).

**The change.** Before printing SKIP, the checker now asks
[OpenAlex](https://openalex.org/), an open index that carries Crossref and
DataCite DOIs and arXiv preprints (under their `10.48550/arXiv.<id>` DOIs). A
hit prints a new mark, `ok~`, with OpenAlex's title and year, and is cached
like any other live lookup with `"via": "openalex"`. Two rules keep it
conservative:

- OpenAlex is only asked when the primary registry *refused*. A primary 404
  still fails the run, because that registry is the authority on its own ids.
- OpenAlex not knowing an id is not a verdict, since its coverage is
  incomplete. That case still falls through to `ok*` or SKIP.

**Checked on real citations.** With Crossref and arXiv forced to answer 403,
the seven ids in the `buildbot-sheathing` README (five DOIs, including
`10.1061/(ASCE)0733-9445(2001)127:4(433)` with its brackets, and two arXiv
ids) all resolved through OpenAlex with the right titles. One caveat shows up
there too: OpenAlex merges an arXiv preprint with its journal version, so
arXiv 2110.10107 reads 2022 rather than 2021. The output names the source so a
reader knows which registry spoke.

Whether OpenAlex is reachable when Crossref is not is the open question; the
sessions that probed it found it up. The next runs' records will say whether
SKIPs drop.
