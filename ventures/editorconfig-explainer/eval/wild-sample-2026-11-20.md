# The engine on the 300 most-starred GitHub repositories (2026-11-20)

`node eval/wild-sample.mjs --top 300 --out eval/wild-sample-2026-11-20.json`: the 300 most-starred repositories
from GitHub search (`stars:>1000`, sorted by stars, on 2026-11-20), each cloned blobless at its default branch's
HEAD. Every `.editorconfig` in the tree went through `analyze()` against the repository's full file list.
Symlinked `.editorconfig` files were left out (a first run read airbnb/javascript's two symlinks as files and
reported their link targets as invalid lines; the script now skips mode 120000). The per-repository findings
and commit hashes are in `wild-sample-2026-11-20.json`.

- 300 repositories cloned, 0 failures; **89 have a top-level `.editorconfig`** (141 `.editorconfig` files
  across them, nested ones included).
- 60 of the 89 produce no finding at all.
- 4 have a high or medium finding other than an unmatched section.

| Finding | Repositories |
| --- | ---: |
| section matches no tracked file | 21 |
| nested `root = true` | 12 |
| invalid value | 4 |
| pair overridden for every file it applies to | 4 |
| no `root = true` at the top | 2 |
| comma outside braces | 1 |
| key set twice in a section | 1 |
| invalid line | 1 |

No repository in the sample has an inline comment after a value, `root = true` inside a section, a misspelled
key or a one-item brace. The specification-versus-core disagreements are a hazard for anyone writing these
files, not something the most-starred projects commonly trip on.

## The findings worth reading

Each was checked by hand against the file at the commit listed. The two core behaviours were checked with
editorconfig-core-py 0.17.1 and the npm `editorconfig` 4.0.1.

- **torvalds/linux** (`65e4fd942f72`), `.editorconfig:18`: `[tools/{perf,power,rcu,testing/kunit}/**.py,]`,
  under the comment "this must be below the general *.py to overwrite it". The trailing comma is outside the
  braces, so it is literal text and the section matches only names ending in `.py,`. Both cores give
  `tools/perf/x.py` `indent_style=space` and `indent_size=4` from `[*.py]`, not the tab and 8 the section sets.
- **denoland/deno** (`d8c551b5a5b4`), `.editorconfig:11`: `[*.out] # make editor neutral to .out files`. The
  line is invalid under the specification. core-py applies `[*.out]`. The npm core stops reading at the line, so
  `[*.out]` and the later `[tests/node_compat/test/**]` are both lost: for `tests/node_compat/test/a.js`,
  core-py reports `insert_final_newline=unset` and npm `insert_final_newline=true`.
- **nvm-sh/nvm** (`ecf142d1f006`): `indent_size = false`, `insert_final_newline = off`, `indent_style = off`
  (8 lines). None is a value the specification defines, so plugins ignore them and the settings from `[*]` stay.
  `unset` is the specified way to cancel a setting.
- **airbnb/javascript** (`8ed19247bef1`), `.editorconfig:14`: `indent_size = false`, the same case.
- **react/react** (`e04279e76e27`), lines 13 and 16: `max_line_length = 0`. `max_line_length` is not in the
  specification; editors that read it document a number or `off`. Reported as low.

The 21 unmatched sections are mostly templates for files a repository does not track: `[Makefile]` in
projects without one, `[COMMIT_EDITMSG]`, which git writes at commit time, and generated or vendored paths. The
tool presents an unmatched section as evidence from the file list, not as an error, and these show why.
