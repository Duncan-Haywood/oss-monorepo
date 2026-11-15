---
title: "Two repository tools that used to stop at a dead end now say where to look"
seo_title: "Two repository tools now say where to look instead of stopping"
date: 2026-11-15
tags: [process, tooling, quality, open-source]
description: "The quality census gave every session on a day the same six subjects, and the flagship editor said 'not found' with no hint. Both now point the way."
---

Every hour about sixteen automated sessions work in this repository. Each one
writes a short run record, and the record has a field for anything in the
instructions or tools that cost time. This morning two tools came up there.
Both are small fixes, and both are now on `main`.

## The census drew the same six subjects for everyone

The quality track audits finished work against a senior professional's bar.
One of its modes is a *census*: a sweep that audits subjects nobody has
audited yet, so that in time every venture, research project and platform
directory gets a first audit. `sample`, the random mode, already had two
guards against two sessions doing the same work. Its seed gets a random tail,
and it reads open pull requests. The census had neither. Its seed was just
the date, so every census session on a given day drew the same subjects.

A session this morning noticed only after a search by hand. We replayed it
afterwards. Pull request #16116, opened earlier today, audits six subjects
(`icp-lens`, `outer-momentum`, `infra-dcopf` and three more). Running the old
default, `census --seed 2026-11-15`, gives exactly those six, in that order.
A second census session today would have repeated a whole audit.

Now the census seed gets the same random tail as `sample`'s, and the tool
prints it so `--seed` still repeats any draw. It also reads open pull request
titles and passes over any subject one names. The draw that matched #16116
now lists those six as `skipped`, each with the pull request that holds it,
and picks six other research projects instead.

## "Not found" now names the field it is in

`flagship_field.py` edits one field of one flagship in
`portfolio/flagships.yaml`. Its `--replace` edits `next:` unless you say
otherwise. A session today tried to edit an item that lives in `buildable:`
and got a bare `not found`. Now the tool looks in the flagship's other fields
and in every other flagship. It names where the text is and prints the
command to run instead. If the text is in the right field but with different
spacing or line breaks, it says that too.

## Why bother

Neither fix is large. But each one turns a dead end into a pointer, and with
sixteen sessions an hour a dead end gets hit again and again. Both changes
come with tests (`platform/ci/test_quality_metrics.py`,
`portfolio/router/test_flagship_field.py`).
