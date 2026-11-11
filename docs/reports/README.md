# Agent reports

Notes one run leaves for the next: what was measured, what broke, what to do
next. Posts in `docs/posts/` are for people. These are for whoever picks up the
work. Each report starts with front matter, so a run can find every note on a
project or a topic without grepping 2,000 files:

```
---
kind: milestone
date: 2026-11-03
subjects: [verifiable-training-mechanisms]
topics: [research-integrity]
---
# verifiable-training-mechanisms milestone 49 (agent note)
```

| Field | Required | Values |
|---|---|---|
| `kind` | yes | `analysis`, `milestone`, `lane`, `brief`, `polish`, `note` (defined in [`../taxonomy.json`](../taxonomy.json), `report_kinds`) |
| `subjects` | no | project directory names under `ventures/`, `research/` or `platform/` |
| `topics` | no | topic ids from [`../taxonomy.json`](../taxonomy.json); `doc_index.py topics` lists them |
| `date` | no | `YYYY-MM-DD`, the day the report was written. Leave it out rather than guess |
| `status` | no | `current` (the default) or `superseded` |
| `superseded_by` | no | the report that replaces this one, when `status: superseded` |
| `tagged` | no | `auto` when `doc_index.py backfill` inferred the tags; delete it once a person or agent has checked them |

Before you push a report, run `python3 platform/ci/doc_index.py check`.
`doc_index.py backfill --write` drafts missing front matter and swaps an alias
topic (`aeo`, `lighthouse`) for its id; check the tags it writes. Topics come
from the vocabulary (`doc_index.py topics`), not free text: on 2026-11-11 main
carried 73 problems, most of them polish reports tagged `tooling` or `design`
before `design` existed. Until a PR workflow runs the check, nothing else will.

## Finding things

```
python3 platform/ci/doc_index.py find shallow-clone   # the guidance sections, reports, posts and history on it
python3 platform/ci/doc_index.py find shed-designer   # everything about one project
python3 platform/ci/doc_index.py find pytest          # an alias: resolves to python-env
python3 platform/ci/doc_index.py topics               # the vocabulary, with counts
```

`find` lists guidance sections highest precedence first (the layers in
[`prompts/SYSTEM.md`](../../prompts/SYSTEM.md)), then reports newest first
(superseded ones last), then posts whose `tags` match the topic or its
aliases, then `docs/history/` files named for it. `--json` gives the same for
an agent.

## Adding a topic

A topic earns a place when guidance covers it and more than one report or post
would carry it. Add it to `taxonomy.json` with an `id` (kebab-case), a `label`,
`aliases` (the words people actually use, including tool names) and
`covered_by`: the sections that answer it, as `path#Heading` (a case-insensitive
prefix of the heading) or a bare path. `doc_index.py check` fails on a heading
that no longer exists, so a renamed section shows up as a broken anchor instead
of a silently stale pointer. Aliases may not collide across topics.

`infer` is optional: `false` keeps `backfill` from ever adding the topic, and a
list restricts it to those words (for ids like `depth` or `money` that are
ordinary English in a title).

## Why

On 2026-11-03 the 261 reports here carried no metadata, 919 distinct tags were
in use across the posts, and the guidance map
([`prompts/system.json`](../../prompts/system.json)) said which *file* answers
a question but not which *section*. The tags on the 261 existing reports were
inferred from file names and titles (`tagged: auto`): 97 have no date because
neither the name nor a `**Date:**` line gives one, and most have no topic
because their titles name a project, not a process topic. Both are gaps to
fill by reading, not by guessing.
