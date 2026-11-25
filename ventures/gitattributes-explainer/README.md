# .gitattributes Explainer

A free tool for developers: **paste your `.gitattributes` files and a list of paths, and see every attribute of
every path and the line that set it, resolved the way `git check-attr` resolves it.** It finds the lines git
silently drops, `docs/` patterns that never reach a file, Git LFS lines without `-text` and misspelled
attributes, and says what git will do to each file's line endings under your `core.autocrlf` and `core.eol`.
Nothing is uploaded.

**Live tool:** https://marisstella.app/gitattributes-explainer/ ·
**Guide:** [five reasons a .gitattributes line does nothing](why-gitattributes-not-working.html)

After using this, you can **say which line gives a file its attributes and why a line you wrote has no
effect, without trial and error**. `git check-attr -a` answers for one path and does not say which line
decided, that a macro was expanded, or that a line was dropped; this tool answers for every path at once and
names the deciding line for each attribute.

## What it reports

- **Every path's attributes**: each one's value (set, unset, unspecified or a string), the file and line that
  decided it, and the macro it came through (`binary`, or your own `[attr]` macros).
- **Lines git ignores** (high): a `!` pattern (not allowed in attribute files), an `[attr]` macro in a
  `.gitattributes` below the root, an invalid attribute name (which drops every attribute on the line), a
  `builtin_` name on git 2.44+, and lines of 2,048 bytes or more.
- **Folder patterns** (high): `docs/ linguist-documentation` matches the folder, never a file in it. The fix
  `docs/** ...` is written out. `export-ignore` alone is not flagged, since `git archive` checks folders.
- **Values and names git does not know**: `eol=CRLF`, `text=true`, `diff=false`, `Text`, `linguist-vendor`,
  an unquoted file name with a space, the old `crlf` attribute, `eol` on a non-text path.
- **Git LFS lines without `-text`** (medium).
- **Line endings, per file**: the request `git ls-files --eol` prints (`text=auto eol=lf` and so on) and the
  outcome: whether CRLF becomes LF on commit, and whether checkout writes LF, CRLF or the bytes as stored.
- **Lines that do nothing in your list**: match no path, or match but decide nothing because a more important
  line decides every attribute they set. Evidence from your list, not proof.

## How the engine works (`gitattributes.mjs`)

A reimplementation of git's attribute rules, written from the gitattributes(5) manual and from reading the
behaviour of git's `attr.c`, `dir.c`, `quote.c` and `convert.c` (no git code is copied; git is GPL-2.0):

- Line handling: leading whitespace skipped, `#` comments, C-style quoted patterns (`"my file.txt"` with
  `\303\251` octal bytes), space, tab and CR as separators, a UTF-8 BOM on line 1, the 2,048-byte limit.
- States: `name` set, `-name` unset, `!name` unspecified, `name=value`; names `[-._0-9a-zA-Z]+`, not starting
  with `-`; `builtin_` reserved from git 2.44 (present in `attr.c` at v2.44.0, absent at v2.43.0).
- Matching: git's `wildmatch` and `match_basename`/`match_pathname`, shared with
  [`../gitignore-explainer`](../gitignore-explainer/README.md) (same repository, same FSL-1.1-MIT licence), including
  the git 2.52 change to `**` glued to a literal prefix. A pattern without `/` matches the file name at any
  depth; with `/` it is anchored to the folder of its file; a trailing `/` matches folders only.
- Precedence: `.git/info/attributes`, then the path's own folder up to the root, then the global and system
  files, then the built-in `[attr]binary -diff -merge -text`. Within a file the last matching line wins; on a
  line the last token wins. Macros are defined by the most important definition, expand only when set, and
  fill only attributes not yet decided (`attr.c`, `determine_macros` and `fill_one`).
- Line endings: `convert.c`'s `convert_attrs`, `text_eol_is_crlf` and `output_eol`, so `eol` implies text,
  `-text` beats `eol`, `crlf` is read only when `text` is not set, and `core.autocrlf` beats `core.eol`.

### How it was checked

- `gitattributes.diff.test.mjs` builds random repositories (trees up to four folders deep, root and nested
  `.gitattributes`, `.git/info/attributes`, random patterns, quoted patterns, CRLF lines, macros in allowed
  and disallowed places, invalid and reserved names, `!` patterns) and requires the engine to give exactly
  the attributes `git check-attr -a` prints for every file and folder, and exactly the `attr/` column of
  `git ls-files --eol` for every file. 160 repositories by default; a run of 3,000 (about 60,000 paths) on
  git 2.43.0 found no difference. It also checks the page's example.
- `eol.git.test.mjs` commits an LF and a CRLF file under 19 attribute lines and 9 `core.autocrlf` /
  `core.eol` settings, reads the stored blob and a fresh checkout, and requires the engine's prediction for
  all 342 cases.
- `gitattributes.test.mjs` pins the worked example in the EXAMPLES section of gitattributes(5) (the path
  `t/abc`: `foo` set, `bar` unspecified, `baz` unset, `merge=filfre`), plus the cases above by hand.
- `cli/check.mjs --verify` runs the same comparison against your own git on your own repository.

**Spec sources:** the gitattributes(5) manual (git's `Documentation/gitattributes.adoc`), git's `attr.c`,
`dir.c`, `quote.c` and `convert.c` as the reference behaviour, and git itself as the oracle. The professional
who would sign this off is a release or build engineer who owns a repository's `.gitattributes`.

**Limits:** it does not run filters or diff drivers, so it says which driver is named, not what it does.
`text=auto` depends on file content (git treats a file with a NUL byte, a lone CR or many control characters
as binary, and does not re-normalise a file already committed with CRLF); the tool says so instead of
guessing. GitHub reads `linguist-*` through its Linguist library, not git; this tool resolves those the way
git does, which is what was tested. Case-insensitive matching (`core.ignorecase`) is not modelled.

## Use it

- **Web:** paste files and paths, choose your git version and line-ending settings, press Explain. "Why does
  one path get these attributes?" lists every matching line in the order git reads them, with each
  attribute marked as deciding or already decided by a named line.
- **CLI:** from inside any git repository, `node ventures/gitattributes-explainer/cli/check.mjs`
  (`--why <path>`, `--verify`, `--json`, `--strict` to fail CI on a high finding, `--bundle` to paste into
  the page). No dependencies, no network. Node 18+.
- **Agents:** `analyze({ sources, paths, git, settings })` and `why({ sources, path })`; see `llms.txt`.

## Privacy

Everything runs in your browser. What you paste is never uploaded; there are no accounts, cookies or analytics
vendors. Four anonymous events (`attributes_checked`, `example_loaded`, `why_shown`, `report_downloaded`) are
counted in local storage on your device only, never with your data, and are off under Do Not Track or with the
switch on the page.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is
not legal, security or professional advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, for example with
`git check-attr -a`. To the maximum extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken
offline without notice. Do not use this as a system of record.

Not affiliated with or endorsed by the Git project, GitHub, GitLab or Git LFS. Git is a trademark of the
Software Freedom Conservancy.

## Tests

```
node --test gitattributes.test.mjs gitattributes.diff.test.mjs eol.git.test.mjs page.test.mjs usage.test.mjs cli/check.test.mjs
GITATTRIBUTES_DIFF_TRIALS=3000 node --test gitattributes.diff.test.mjs   # the long run
```

FSL-1.1-MIT licence. Support is optional: https://github.com/sponsors/Duncan-Haywood
