---
title: "Three .editorconfig lines two EditorConfig cores read differently"
seo_title: "EditorConfig cores disagree: core-py vs npm, tested on 23,149 cases"
date: 2026-11-20
tags: [ventures, editorconfig, developer-tools, differential-testing]
description: "An EditorConfig explainer passes all 198 runnable core-tests, finds where two shipping cores disagree, and a Linux .editorconfig section that never matches."
---

[EditorConfig Explainer](../../ventures/editorconfig-explainer/) is a new
free tool: paste your `.editorconfig` files and `git ls-files`, and every file
comes back with its settings and the section and line that set each one. It
also flags sections that match nothing, and for each one it suggests a glob
that would match. The most common mistakes are `[*.{md}]` (braces with one item
are literal text) and `[src/*.js]` (a single `*` stops at the first folder).

## The spec, then the test suite

The engine follows the EditorConfig specification (0.17.2). We cloned the
project's official [core-tests](https://github.com/editorconfig/editorconfig-core-test)
and wrote a small harness, `eval/core-tests.mjs`, that reads every
`new_ec_test` call in its CMake files and runs it through the engine. All 198
runnable tests pass. The one we skip passes a Windows path on a command line.

The suite runs in seconds. The four exact-integer range tests were the reason
the matcher is a backtracking walk over a tree and not a regular expression:
`{1..3}{0..9}` has to try reading `15` as 1 and 5.

## Then two real cores

A test suite only checks what someone thought to write down. So
`eval/differential.mjs` builds random trees of one to three `.editorconfig`
files. Section names come from a fixed list or are put together at random
from wildcard pieces, keys and values are random, and each tree gets eight
paths. Each case goes to the engine, to
[editorconfig-core-py](https://pypi.org/project/EditorConfig/) 0.17.1 and to
the npm [`editorconfig`](https://www.npmjs.com/package/editorconfig) package
4.0.1.

Over 23,149 cases the npm core agreed with the engine on 23,100, and
core-py on 22,005. Every remaining difference came from one of four causes:

| What is in the file | Spec | core-py 0.17.1 | npm 4.0.1 |
| --- | --- | --- | --- |
| `indent_size = 4 # four` | value is `4 # four` (0.15+) | strips it to `4` (637 cases) | `4 # four` |
| `[\*.c]` | `\` escapes: a file named `*.c` | `*` is still a wildcard (452) | literal |
| `[{a,b}[!a]1]` on `a/1` | silent | `[!a]` matches the `/` (55) | no match |
| `[{20..1}]` | invalid, matches nothing | matches nothing | counts down, matches 12 (49) |

The first matters most. The specification dropped inline comments in 0.15 and
the core-tests check it (`semicolon_or_hash_in_property`). A project that
writes `indent_size = 4 # PEP 8` gets four-space indents in an editor whose
plugin uses core-py, and the editor's default indent in one whose core
follows the spec.

## Then real projects

`eval/wild-sample.mjs` takes the 300 most-starred repositories on GitHub,
clones each one without file contents, and runs every `.editorconfig` in it
against its full file list. The results are in
[the sample report](../../ventures/editorconfig-explainer/eval/wild-sample-2026-11-20.md).
89 of the 300 have a top-level `.editorconfig` (141 files counting nested
ones), and 60 of those 89 produce no finding at all. None of them uses an
inline comment, so for popular projects that disagreement is a trap waiting
to be stepped in, not a common bug. Two findings stood out. deno's top-level `.editorconfig` has this line:

```
[*.out] # make editor neutral to .out files
```

A section line has to end with `]`, so the specification calls this line
invalid. core-py reads the header up to the `]` and applies the section. The
npm core stops reading the file at that line. On deno's file, core-py gives
`tests/node_compat/test/a.js` `insert_final_newline=unset`, and the npm core
gives `insert_final_newline=true`, because the valid
`[tests/node_compat/test/**]` section further down is never read. The tool now
reports this line as high severity and names what each core does with it.

The Linux kernel's `.editorconfig` has a quieter problem, one that every core
agrees on:

```
# this must be below the general *.py to overwrite it
[tools/{perf,power,rcu,testing/kunit}/**.py,]
indent_style = tab
indent_size = 8
```

The trailing comma sits outside the braces, so it is literal text. The section
only matches file names that end in `.py,`. We checked with both cores:
`tools/perf/x.py` gets `indent_style=space` and `indent_size=4` from the
general `[*.py]` section, the opposite of what the comment says it wants. The
explainer now flags a comma outside braces.

## What is next

The CLI (`cli/check.mjs --strict`) already fails a build on a high finding, so
a GitHub Action to lint `.editorconfig` files is a short step. Separately, the
three core-py differences look like bugs to report upstream, each with a
minimal file.
