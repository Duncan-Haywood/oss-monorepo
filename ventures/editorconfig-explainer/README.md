# EditorConfig Explainer

A free tool for developers: **paste your `.editorconfig` files and a list of file paths, and see every file's
settings with the section and line that set each one**, resolved the way an EditorConfig core resolves them. It
finds sections that match none of your files and suggests a glob that would, a `root = true` that does nothing,
misspelled keys and invalid values, and the lines that **different editors read differently**. Nothing is
uploaded.

**Live tool:** https://marisstella.app/editorconfig-explainer/ ·
**Guide:** [why an .editorconfig section does not match, and where editors disagree](why-editorconfig-section-does-not-match.html)

After using this, you can **say exactly which line gives a file its indent, line ending or charset, and fix a
section that does nothing without reopening files in your editor**. The `editorconfig` command line from a core
prints the result for one file; this tool does every file at once, says which line won and which it overrode,
and says why a section matched nothing.

## What it reports

- **Every file's settings**: each key, its value, the `[section]`, file and line that set it, and the values it
  overrode; the derived `tab_width` and `indent_size = tab` as the cores report them.
- **Values editors disagree on** (high): `indent_size = 4 # four`. Since specification 0.15 a `#` or `;` after a
  value is part of the value, so spec-following cores read `4 # four` and editors drop the setting;
  editorconfig-core-py 0.17.1 still strips the comment and reads `4`.
- **Section headers with a comment after them** (high): `[*.out] # note` is an invalid line. editorconfig-core-py
  applies the section anyway; the npm `editorconfig` core stops reading the file there, so every section below it
  is lost as well.
- **`root = true` inside a section** (high): it only counts above the first section.
- **Sections that match no listed file** (medium), with a looser glob that would: a `/` anchors the name to its
  file's folder (`[**/src/*.go]`), `*` stops at `/` (`[src/**.go]`), matching is case-sensitive.
- **Section names that cannot mean what they say**: `{md}` with one item is literal text, a trailing `/`, a `\`
  used as a separator, spaces inside the brackets, a comma outside braces (literal text: the Linux kernel's
  `[tools/{perf,power,rcu,testing/kunit}/**.py,]` matches no Python file for that reason), a reversed `{9..1}` (invalid; the npm core counts down and
  matches it anyway), `\*` (literal in the spec and the npm core, a wildcard in core-py 0.17.1).
- **Misspelled keys** (`indent-size`, `trim_trailing_whitespaces`), **invalid values** (`indent_size = false`,
  `insert_final_newline = off`, where `unset` is what cancels a setting), pairs above the first section, a key
  set twice in one section, and pairs overridden for every listed file they apply to.
- **Structure**: a nested `root = true` that cuts its folder off from the files above, and a top-level file
  without `root = true` (editors then keep reading `.editorconfig` files above the project, such as one in the
  home folder).

## How the engine works (`editorconfig.mjs`)

Written from the EditorConfig specification, version 0.17.2:

- Lines are trimmed; `#` or `;` first makes a comment; `[...]` is a section (the name is everything between the
  first `[` and the last `]`, spaces included); `key = value` splits at the first `=`, keys are lowercased, and the
  values of the six format keys are lowercased as the cores do. Nothing after a value is a comment.
- Section names compile to a small tree and a backtracking matcher: `*` (not `/`), `**` (anything), `?`,
  `[...]` and `[!...]` (never `/`; a `/` before the `]` makes the bracket literal), `{a,b}` nested, `{num1..num2}`
  checked as an integer with no leading zero, `\` escapes, and `{single}` literal. A regular expression is not
  enough for ranges: `{1..3}{0..9}` has to try splitting `15` as 1 and 5.
- A name with a `/` outside brackets is anchored to the folder of its `.editorconfig` (a leading `/` is dropped);
  a name without one matches at any depth below it. The folder's own path is literal text.
- Files are read from the nearest `root = true` down to the file's folder; later sections and nearer files win.

### How it was checked

- **The official core-tests** (github.com/editorconfig/editorconfig-core-test, BSD-2-Clause, not vendored):
  `eval/core-tests.mjs <clone>` reads every `new_ec_test*` call in the suite's CMake files and runs it through the
  engine. **198 of 198 pass**; the one skipped test passes a Windows path on a command line, and the `cli/` folder
  has none (2026-11-20, suite HEAD).
- **Two shipping cores** (`eval/differential.mjs`): random trees of one to three `.editorconfig` files, with
  section names from a fixed list and composed at random from wildcard atoms, random keys and values, and eight
  paths each, resolved by the engine, editorconfig-core-py 0.17.1 and the npm `editorconfig` 4.0.1. Over 3,000
  trees (23,149 cases, seeds 7 and 11), every disagreement falls into one of four causes, each a case where the
  engine follows the specification or the core-tests:

  | Cause | core-py 0.17.1 | npm 4.0.1 |
  | --- | ---: | ---: |
  | ` # ` or ` ; ` after a value (spec 0.15: part of the value; core-tests `semicolon_or_hash_in_property`) | 637 | 0 |
  | `\*` or `\?` in a section name (spec: `\` escapes) | 452 | 0 |
  | `[!a]` matching a `/` (the spec is silent; npm and the core-tests' slash-in-brackets rule say a class never spans folders) | 55 | 0 |
  | reversed range `{20..1}` (spec: invalid) | 0 | 49 |
  | agree | 22,005 | 23,100 |

  The engine's position on `[!a]` and `/` is a judgment where the specification says nothing.
- **Real projects** (`eval/wild-sample.mjs`): see [eval/wild-sample-2026-11-20.md](eval/wild-sample-2026-11-20.md).
- Unit tests: `editorconfig.test.mjs`, `cli/check.test.mjs`, `page.test.mjs`, `usage.test.mjs`
  (`node --test ventures/editorconfig-explainer/`).

## Command line

```sh
node ventures/editorconfig-explainer/cli/check.mjs            # report for the repository you are in
node ventures/editorconfig-explainer/cli/check.mjs --why path # files read and sections matched for one file
node ventures/editorconfig-explainer/cli/check.mjs --json     # everything, as JSON
node ventures/editorconfig-explainer/cli/check.mjs --strict   # exit 1 on a high finding (CI)
node ventures/editorconfig-explainer/cli/check.mjs --bundle   # the inputs, to paste into the page
```

It reads `git ls-files` (tracked and untracked, not ignored) and every `.editorconfig` among them. Node 18 or
later, no dependencies, no network.

## Limits

- It resolves what a **core** reports. What an editor then does with a value (whether `max_line_length` is read,
  how `unset` falls back) is the plugin's business; the specification leaves plugins to ignore what they do not
  support.
- `.editorconfig` files above the project are not seen; the report says when the top-level file lacks
  `root = true`, which is when they would matter.
- File names are matched as given, case-sensitively, as the cores do on Linux.

## Usage tracking

Anonymous feature counts (`editorconfig_checked`, `example_loaded`, `why_shown`, `report_downloaded`) are kept in
the visitor's own browser storage only, never with any pasted text, and are off under Do Not Track or the page's
opt-out button (`usage.mjs`).

## No warranty

Free and as-is, without warranty of any kind. Not legal, security or professional advice. Not affiliated with or
endorsed by the EditorConfig project. Your editor's plugin is the final word on what it applies.

FSL-1.1-MIT licensed ([LICENSE](LICENSE)).
