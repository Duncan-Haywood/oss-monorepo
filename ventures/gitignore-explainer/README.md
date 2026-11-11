# .gitignore Explainer

A free tool for developers: **paste your `.gitignore` files and a list of paths, and see which rule decides
every path, resolved the way git resolves it.** It finds the `!` negations that cannot work because a parent
folder is ignored, writes the lines that fix them and checks those lines against your list before offering
them, and lists tracked files your rules match but cannot affect. Nothing is uploaded.

**Live tool:** https://marisstella.app/gitignore-explainer/ ·
**Guide:** [why a `!` negation in .gitignore does nothing](why-gitignore-negation-does-not-work.html)

After using this, you can **say exactly why git ignores a file, or does not, and fix a negation that does
nothing without trial and error**. `git check-ignore -v` answers for one path at a time and does not say that a
negation was blocked; this tool answers for every path at once and says which rule was defeated by which folder.

## What it reports

- **Every path's deciding rule**: file, line and pattern, or "no rule matches", and when the reason is an
  ignored parent folder, which folder.
- **Blocked negations** (high): `build/` then `!build/keep.txt`. Git never looks inside an ignored folder, so
  the negation is never compared with anything. A negation written in a `.gitignore` that sits inside an
  ignored folder is never read at all, and is reported the same way.
- **A checked fix**: for the blocked negations, the lines to append (`!/build/`, `/build/*`, the negation
  again), chosen per negation between its own file and the file of the rule that blocks it. The engine re-runs
  every path with the lines added and reports how many come back, how many stay ignored, and every other path
  whose answer changes.
- **Tracked files a rule matches** (medium): ignore rules do not apply to tracked files; `git rm --cached`.
- **Rules that do nothing in your list**: match nothing (with a hint when a `/` anchors the pattern), match but
  never decide (shadowed), or decide but would be decided the same way without them (redundant). These are
  evidence from your list, not proof; a broad rule with exceptions is often shadowed in a tracked-only list.
- **Lint**: trailing tabs (git trims spaces, not tabs), leading whitespace, `#` after a pattern, `\` used as a
  path separator, `**` glued to other characters, an unclosed `[`.

## How the engine works (`gitignore.mjs`)

A reimplementation of git's ignore semantics, written from git's documentation and behaviour:

- Line handling: comments, `\#` and `\!`, trailing spaces trimmed unless escaped, trailing tabs kept, CR
  stripped, `!` negation, trailing `/` for folders only, a `/` anywhere but the end anchors the pattern to the
  file's own folder.
- Matching: a port of the semantics of git's `wildmatch` (`*`, `?`, `[...]` with ranges, `!`/`^` and
  `[:class:]`, escapes, and `**` only when it fills a whole segment), including git's literal-prefix step:
  git compares the part before the first wildcard as plain text and wildmatches the rest as a pattern of its
  own, so in `/a**/x` the `**` crosses folders. The differential test found that one.
- Precedence: last matching line wins within a file; the deepest `.gitignore` with any match wins over those
  above it; `.git/info/exclude` comes last. A folder is checked before anything inside it, and once a folder is
  ignored, nothing below it is considered and no `.gitignore` below it is read.

### How it was checked

`gitignore.diff.test.mjs` builds random repositories (random trees up to four levels deep, random rules from
segments such as `*`, `**`, `[!a]`, `[[:alpha:]]`, `\*`, unclosed `[`, with nested `.gitignore` files and
`.git/info/exclude`), runs `git check-ignore --no-index -v -n` on every file and folder, and requires the
same deciding file and line for each. A second test applies every suggested fix in git and checks that git
agrees with what the report claimed: which paths come back, which stay ignored, which others change.

Measured with git 2.43.0 on 2026-11-11:

| Run | Result |
| --- | --- |
| 4,000 random repositories (`GITIGNORE_DIFF_TRIALS=4000`) | 63,578 paths and folders, every one agrees with git |
| this repository's own 73 ignore files, 391 rules | 63,639 tracked paths and folders, 0 disagreements |
| suggested fixes, same run (8,000 random repositories, seed 424242) | 1,294 fixes, each matching git; 1,142 re-include every blocked path, 1,219 change no other path |

The default suite runs 150 repositories (about 3 seconds); set `GITIGNORE_DIFF_TRIALS` for more. The random
rules are deliberately odd, so the fix rates above are a stress figure, not a forecast for ordinary files.

Not covered: `core.excludesFile` (the CLI does not read your global file; paste it as
`==> .git/info/exclude <==` to include it, which gives it the same lowest precedence),
`core.ignoreCase` (matching is case-sensitive, as on Linux), sparse checkout and `git add -f`.

## Command line

```
node cli/check.mjs                 # report for the repository you are in
node cli/check.mjs --why <path>    # folder-by-folder steps for one path
node cli/check.mjs --json          # the full report
node cli/check.mjs --strict        # exit 1 if a high-severity finding exists (for CI)
node cli/check.mjs --bundle        # the inputs as JSON, to paste into the page
```

It reads every tracked and untracked `.gitignore`, `.git/info/exclude`, `git ls-files` and
`git ls-files --others` (capped at 50,000 untracked paths; `--max` changes it). No network, no dependencies,
Node 18 or later. On this repository (55,196 tracked files, 391 rules) a full report takes about 2 seconds.

## Tests

```
node --test gitignore.test.mjs gitignore.diff.test.mjs page.test.mjs usage.test.mjs cli/check.test.mjs
```

## Privacy and usage counting

The page computes in your tab and sends nothing anywhere. It counts four anonymous events
(`gitignore_checked`, `example_loaded`, `why_shown`, `report_downloaded`) in your browser's local storage only,
never with what you pasted; Do Not Track and Global Privacy Control switch it off, and the page has an off
switch.

## No warranty

Free and as-is, without warranty of any kind. Not legal, security or professional advice. It does not run git;
check anything that matters with `git check-ignore -v`. Not affiliated with the Git project or any vendor.

MIT licensed. See [LICENSE](LICENSE).
