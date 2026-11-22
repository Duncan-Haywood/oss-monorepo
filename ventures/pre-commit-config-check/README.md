# Pre-commit Config Check

**Why does pre-commit reject my `.pre-commit-config.yaml`, and what does it accept without telling me?**

**Live tool:** https://marisstella.app/pre-commit-config-check/

`pre-commit` stops at the first problem in its config and prints a chain of
`==> At key:` lines; fix it, run again, hit the next. This tool lists every
error at once, each in pre-commit's own words with its line number and a
plain fix, and adds what pre-commit accepts silently. It runs in the browser
or as a zero-dependency Node CLI, and nothing is uploaded.

Spec sources: the rules are pre-commit 4.7.0's own validation schema
(`pre_commit/clientlib.py`, with the `cfgv` 3.5.0 validators it uses), the
YAML 1.1 scalar types as PyYAML 6.0.4 resolves them (https://yaml.org/type/),
and CPython 3.11's regular-expression syntax (`Lib/re/_parser.py`). The
person who would sign it off is the maintainer of a repository's pre-commit
setup; the arbiter is `pre-commit validate-config` itself, and
`differential/` compares against it (see "How close is it").

## What it checks

From pre-commit itself (same order, same messages, same context chain):

- required keys (`repos`, `rev` on a remote repo, `id`/`name`/`entry`/`language` on a `repo: local` hook), `rev` on local and meta repos, meta hook ids and `entry`;
- types, including the YAML 1.1 traps: `args: [--line-length, 100]` (an int), `rev: 6.0` and `language_version: 3.11` (floats), `rev: 2024-01-01` (a date), `pass_filenames: "false"` (a string), while `pass_filenames: no` is a real boolean;
- `files` / `exclude` as **Python** regular expressions: `*.py` is rejected, `(?x)` verbose patterns, `(?P<name>...)` and `\Z` are accepted, `(?<name>...)` and variable-width look-behind are rejected;
- languages, stage names (legacy `commit`/`push` warn), `default_install_hook_types`, `default_language_version`, identify type tags (323 tags from identify 2.6.20), `minimum_pre_commit_version`, `ci` as a map;
- pre-commit's warnings: mutable `rev` (branch names), unknown root and repo keys, `/*` in a regex, `[\\/]` slash classes, legacy stages.

Beyond pre-commit (labelled as this tool's opinion):

| Rule | Level | Why |
| --- | --- | --- |
| `unknown-hook-key` | warning | pre-commit ignores unknown keys inside a hook without a word; suggests the nearest real key |
| `prek-key` | info | a key [prek](https://github.com/j178/prek) reads and pre-commit ignores |
| `duplicate-key` | warning | YAML keeps the last of two equal keys; the first is lost silently |
| `args-glued` | warning | `'--max-line-length 100'` reaches the tool as one argument |
| `tag-not-sha` | info | a tag can be moved; `pre-commit autoupdate --freeze` pins SHAs |
| `manual-only` | info | a hook with only `stages: [manual]` never runs on commit |
| `language-renamed` | info | 4.7.0 reads `system`/`script` as `unsupported`/`unsupported_script` |
| `python-version` | info | possessive quantifiers and atomic groups need Python 3.11+ |
| `old-list-format`, `sha-key`, `root-key-typo` | info/warning | pointers to `pre-commit migrate-config` and likely typos |

## What it found in 69 public configs

The `.pre-commit-config.yaml` of 69 well-known public projects (list and
hashes in `differential/corpus.json`, fetched 2026-11-22) all pass
pre-commit 4.7.0. Beyond it: 328 of 448 `rev:` lines (52 files) pin a tag
rather than a commit SHA; 20 files use `language: system`/`script`; 11 files
have manual-only hooks; three (Airflow, Ruff, tox) carry prek keys
(`priority`, `env`, `minimum_prek_version`, `default_env`) that pre-commit
ignores. No file had an unknown hook key, a duplicate key or a glued args
item.

## How close is it

Measured against the real tools on 2026-11-22 (`differential/README.md`):
the same verdict, first error and warnings as pre-commit 4.7.0 on all 5,244
files (69 real configs and 5,175 single-edit variants); YAML values identical
to PyYAML on 114 of 114 files; regex verdicts equal to CPython 3.11 on
199,999 of 200,000 generated patterns. The variants come from a list of
mistakes written for this tool, so this is evidence on those traps, not on
every possible file.

## Use it

```
node cli.mjs                          # ./.pre-commit-config.yaml
node cli.mjs path/to/config.yaml      # a specific file
node cli.mjs --format json            # machine-readable
node cli.mjs --strict                 # exit 1 on warnings too
node cli.mjs --pre-commit-version 3.8.0
```

Exit 0 when pre-commit would accept the file, 1 when it would not (or, with
`--strict`, on any warning), 2 for a missing file. Node 18+, no install.

## Privacy

The page reads only what you paste, in your browser, and makes no network
calls. Anonymous feature counts (`check_run`, `example_loaded`) stay in local
storage and can be switched off on the page; Do Not Track and Global Privacy
Control are honoured.

## Development

```
python3 platform/ci/run_venture_tests.py pre-commit-config-check
```

Files: `check.mjs` (schema and beyond rules), `yaml11.mjs` (PyYAML-typed
YAML reader), `pyregex.mjs` (Python regex syntax), `tables.mjs` (generated
lists), `cli.mjs`, `index.html`, `differential/` (comparisons with the real
tools).

### Updating the tables

`tables.mjs` is generated from an installed pre-commit and identify:
`<python-with-pre-commit> differential/gen-tables.py > tables.mjs`. After a
bump, re-run the three scripts in `differential/`.

## Disclaimers

Free and provided as-is, without warranty of any kind. It is not a security
audit and does not run your hooks; check its output against the pre-commit
version you use. Not affiliated with or endorsed by the pre-commit or prek
projects. pre-commit, cfgv and identify are MIT-licensed projects by Anthony
Sottile and contributors.

MIT licensed (`LICENSE`).
