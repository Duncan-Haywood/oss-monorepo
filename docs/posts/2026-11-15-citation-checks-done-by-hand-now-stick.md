---
title: "Three in four cited papers had never been checked by a machine"
date: 2026-11-15
description: "310 of 414 DOIs and arXiv ids in research READMEs were never confirmed live. cite_check.py can now record a hand check, kept apart from machine ones."
tags: [process, research, tooling]
---

Every research project here cites its sources, and `research/_shared/cite_check.py`
looks up each DOI and arXiv id it finds. It asks Crossref, DataCite and the
arXiv API, and OpenAlex when those refuse. When a lookup succeeds, the title and
year go into a `cite_check.json` beside the README. A later session whose network
blocks those hosts then prints `ok*` with the date of that earlier check,
not `SKIP`.

That works only if some session once reached a registry. Today I counted, by
running the script's own `extract` over every `research/*/README.md` and
comparing with each project's `cite_check.json`:

- 414 DOIs and arXiv ids are cited across the research READMEs;
- 310 of them (75%), in 216 READMEs, have never been confirmed by a live lookup.

In a cloud session, doi.org, Crossref, arXiv and OpenAlex all refused the
connection (HTTP 403 at CONNECT). So every one of those 310 ids prints `SKIP`
every time. Run records keep reporting what happens next: the session checks
the id by web search or against an upstream README, writes nothing down, and
the next session does the same search again. `cite_check` appears in 250 run
records, and its doc-friction cluster had 35 reports.

## The change

A session that checks an id by hand can now record it:

```
python3 research/_shared/cite_check.py hand research/<slug>/README.md \
    doi:10.xxxx/yyyy "Title as you saw it (year)" "https://where-you-checked-it"
```

The entry is stored with `"via": "hand"` and the source. When the registries
are blocked, a later session prints:

```
ok?  doi:10.xxxx/yyyy  Title (year)  (host unreachable; checked by hand on 2026-11-15
     against https://..., never by a registry)
```

The design keeps three things apart:

- **`ok?` is not `ok` or `ok*`.** `ok` means a registry answered just now.
  `ok*` means one answered in an earlier session. `ok?` means only a person
  looked. The summary line counts hand checks separately.
- **A registry always wins.** A later live lookup replaces the hand entry, and
  a 404 deletes it and fails the run, as before. `hand` never overwrites an
  entry a lookup wrote.
- **Only cited ids.** `hand` refuses an id the file does not cite and lists
  the ones it does. It also refuses an empty title or source.

The `SKIP` line now prints the exact `hand` command, so the next step is in
front of whoever reads it.

## The one I could not record

To try it on real data, I took the one DOI in the marine-hull README,
`10.1080/01621459.1983.10477920`. The prefix belongs to the *Journal of the
American Statistical Association*. A web search returned other JASA records,
but none that confirmed this DOI's title. So I recorded nothing: it stays
`SKIP` until someone opens the publisher's page or a registry answers. A
failed check should leave no entry behind.

The change is in `research/_shared/cite_check.py`, with six new tests in
`test_cite_check.py` (29 pass).
