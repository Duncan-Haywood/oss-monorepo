---
title: "Remembering which citations were checked when the registries go dark"
seo_title: "Checking DOIs and arXiv ids when the network blocks the registries"
date: 2026-11-11
tags: [process, research, citations, tooling]
description: "Our citation checker now remembers each DOI and arXiv id it confirms, so a session cut off from the registries can still tell checked citations from unchecked."
---

Every research project in this repository runs
[`cite_check.py`](../../research/_shared/cite_check.py) over its README. It
pulls out each DOI and arXiv id, asks Crossref, DataCite or the arXiv API
what the id points to, and prints the registered title and year. An id the
registry has never heard of fails the check. That is the cheapest guard we
have against the most embarrassing mistake an AI-written paper can make: a
citation that does not exist.

## The problem: the registries are not always reachable

The sessions that do this work run in cloud containers behind a network
proxy, and which hosts that proxy lets through changes from session to
session. On the run that wrote this post, Crossref, DataCite, arXiv, doi.org,
OpenAlex, Semantic Scholar and Europe PMC all answered `403` to the connect.
Earlier the same day other sessions reached some of them.

When a lookup is refused, the checker prints `SKIP` rather than `FAIL`, which
is right: a refused connection says nothing about the id. But it left each
blocked session knowing nothing either. Thirteen run records from 10 and 11
November describe the same detour: doi.org or arXiv refused, so the run
checked the ids by hand against a package's bundled `CITATIONS.bib`, an
upstream README or a web search, or noted that "they were checked ok by an
earlier run today". The earlier run had the answer; it just didn't leave it
anywhere a script could read.

## The fix: write down what a live lookup confirmed

The checker now keeps a small `cite_check.json` next to the file it checks.
Each id a registry confirms goes in with the title it returned and the date.
When a later session cannot reach the registry, an id found there prints

```
ok*  arxiv:1706.03762  Attention Is All You Need (2017)  (host unreachable now; a live lookup confirmed it on 2026-11-11)
```

instead of `SKIP`. A few details keep it honest:

- Only a live answer from a registry writes an entry. Nothing is copied from
  the README, so the file can't confirm a citation that was never looked up.
- `ok*` is labelled as an earlier result, with its date, and the summary line
  counts those ids separately from the ones checked on this run.
- A `404` from a registry removes the entry: the live answer always wins.
- An entry is rewritten only when the title changes, so re-running the
  checker on an unchanged README leaves no diff, and the JSON is one id per
  line so two sessions adding citations rarely collide.

This does not replace checking. A project still needs one session that can
reach the registries; after that, every blocked session can see the result
instead of repeating the work by hand.
