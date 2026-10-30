---
title: "What files an LLM reads best, and how that differs from what people read"
date: 2026-10-30
description: "We tokenised the same content as Markdown, HTML, JSON, YAML, TOML, XML and CSV. HTML pages cost 9x their Markdown; a Python interface costs 15% of its module."
tags: [llms-txt, ai-agents, documentation, software-engineering]
---

# What files an LLM reads best, and how that differs from what people read

When you write docs or a spec for a library, you now have two readers. A person
opens the rendered page, skims the headings, looks at the diagram and copies
the example. A language model gets a stream of tokens: it cannot see the
layout, it pays for every character, and it has a fixed budget for how much it
can hold at once. So the formats that serve each reader are different.

We measured the model side on files from this repository, counting tokens with
OpenAI's open `o200k_base` and `cl100k_base` tokenisers (the two agree to
within 1% on everything below, so the tables show `o200k_base`). Other model
families use other tokenisers; the ratios, not the exact counts, are the point.
The script and raw results are in
`docs/reports/assets/file-formats-for-llms/`.

## 1. A web page costs about nine times its Markdown

We took 40 posts from this blog at random and compared each post's Markdown
source with the HTML page the site serves for it.

| Same 40 posts as | Tokens | vs Markdown |
|---|---:|---:|
| Markdown source | 21,992 | 1.0x |
| Served HTML page | 196,634 | 8.9x (median post 13.5x) |
| HTML with tags stripped | 29,498 | 1.3x |

Almost all of the HTML cost is not the article: it is navigation, styles,
scripts and markup. Stripping tags gets close to the Markdown, but the leftover
30% is menu and footer text mixed into the article, which is worse than
missing. This is the case for `llms.txt` and for serving `.md` (or `.txt`)
beside each HTML page, which this site does for its agent-facing posts. People
want the HTML; a model wants the source the HTML was built from.

## 2. For a library, the interface is about a seventh of the code

What an assistant needs to *call* a library is closer to a header file than to
the implementation. We cut 199 Python modules from this repository down to
their imports, class and function signatures and docstrings (the bodies
replaced by `...`, roughly what a `.pyi` stub holds).

| | Share of the module's tokens |
|---|---:|
| Median module's interface | 14.7% |
| Middle half of modules | 8.1% to 28.5% |

So a typed interface with docstrings lets a model see six or seven modules for
the price of reading one. That is why `.pyi` stubs, TypeScript `.d.ts` files,
OpenAPI and JSON Schema documents, and C headers are good things to hand an
assistant: they are specs a machine can read whole. People, by contrast, learn
a library faster from a tutorial and a worked example than from a list of
signatures. The best docs ship both, and the example is worth keeping for the
model too: a short, runnable example is the cheapest way to show intent that a
type signature cannot.

## 3. For tables, CSV wins and XML costs two and a half times as much

One real results table from our research
(`research/marriage-divorce-evidence/reproducibility/annual_acs/predictive_margins.csv`,
12 columns, mostly numbers) written five ways:

| Format | Tokens | vs CSV |
|---|---:|---:|
| CSV | 8,598 | 1.0x |
| Markdown table | 9,752 | 1.13x |
| JSON records, minified | 13,204 | 1.54x |
| JSON records, indented | 18,643 | 2.17x |
| XML rows | 22,174 | 2.58x |

JSON and XML repeat every column name on every row; CSV and Markdown say it
once. A Markdown table is barely dearer than CSV and a person can read it
in a plain text view, which makes it a good default when both readers matter.

## 4. For config and nested data, the format matters less than you'd think

Two YAML files from this repository converted to each format:

| Format | `usage.yaml` (many short fields) | `flagships.yaml` (long prose values) |
|---|---:|---:|
| YAML as written, with comments | 79,792 | 5,647 |
| YAML, data only | 72,832 | 4,711 |
| JSON, minified | 68,355 | 4,658 |
| TOML | 71,413 | 4,713 |
| JSON, indented | 82,859 | 4,783 |
| XML | 92,783 | 4,867 |

When the values are long sentences, every format is within 5%: the words
dominate. When there are many small fields, the syntax shows: XML costs 36%
more than minified JSON, and indentation alone adds 21% to JSON. YAML and TOML
sit in between and are the ones a person can comfortably edit. Note the first
row: the comments cost about 10% of the YAML file, and here they are worth it,
because they hold the *why* (who decided, and when) that neither a person nor a
model can recover from the data.

## 5. Characters per token, by file type

A rough density figure across 300 random files of each type in the repository
(different files, so this compares typical content, not the same content):

| Type | Characters per token |
|---|---:|
| `.ts`, `.yaml` | 4.2 |
| `.md` | 3.8 |
| `.html` | 3.7 |
| `.toml` | 3.7 |
| `.mjs` | 3.6 |
| `.py` | 3.5 |
| `.xml` | 3.1 |
| `.json` | 2.7 |
| `.txt` (here mostly data dumps) | 2.5 |
| `.svg` | 2.3 |
| `.csv` | 1.8 |

English prose and identifier-heavy code tokenise well. Numbers, punctuation
and path data tokenise badly: an SVG's coordinates or a CSV of floats cost a
token every two characters. A rule of thumb of "four characters per token" is
right for prose and too generous for data by a factor of two.

## Tokens are not the whole story

Fewer tokens is not the same as better answers. Two published studies found
that format changes alone move model accuracy: He and colleagues (2024) gave
GPT models the same prompts as plain text, Markdown, YAML and JSON and report
up to a 40% swing on a code-translation task for GPT-3.5, with larger models
less sensitive ([arXiv:2411.10541](https://arxiv.org/abs/2411.10541)); Sclar
and colleagues (ICLR 2024) found up to 76 accuracy points between formatting
choices on LLaMA-2-13B, and that the best format for one model is often not
the best for another ([arXiv:2310.11324](https://arxiv.org/abs/2310.11324)).
We did not run an accuracy test here, so we make no claim that any format
above is *understood* best; the table only tells you what each one costs.

## What we'd write for each reader

| If the reader is | Give them |
|---|---|
| A person learning a library | Rendered HTML, a tutorial, diagrams, a worked example |
| A model calling a library | Type stubs or headers with docstrings, an OpenAPI or JSON Schema spec, one short example |
| A model reading your docs site | `llms.txt` and the Markdown source beside each page, not the HTML |
| Either, for a table | Markdown table (CSV if it is large and only a machine reads it) |
| Either, for config | YAML or TOML with comments that say why |

The common thread: people benefit from presentation and a model pays for it.
Publish the source as well as the page, keep the spec separate from the
implementation, and say each column name once.
