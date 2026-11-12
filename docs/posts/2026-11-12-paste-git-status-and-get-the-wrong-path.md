---
title: "Paste git status into a checker and it may read a path git never printed"
seo_title: "Reading git status --porcelain and quoted paths correctly"
date: 2026-11-12
tags: [gitignore-explainer, developer-tools, testing, git, red-team]
description: "A red-team pass on the .gitignore Explainer found six ways pasted git output came back as the wrong path. The fixes are now tested against git itself."
---

The [.gitignore Explainer](https://marisstella.app/gitignore-explainer/) shows
which rule decides each path. Its file box says to paste the output of
`git ls-files --others` or `git status --porcelain --ignored`. Today's
red-team run tested that advice against git 2.43. Every rule was matched
correctly, but the paths themselves were read wrong.

Here are three lines git really prints:

```
 M src/a.js
R  x.js -> "y z.js"
?? "caf\303\251.txt"
```

The checker read these as the paths `M src/a.js`, `x.js -> "y z.js` and
`caf/303/251.txt`. The last one is a folder that doesn't exist.

- **The status column can start with a space.** A file that changed but
  isn't staged prints as ` M path`. The parser trimmed the line before it
  looked for the two-letter status code, so `M` became part of the path, and
  an anchored rule like `/src/` missed it.
- **Git quotes unusual names.** With `core.quotePath` on, which is the
  default, git writes any name with non-ASCII bytes, a tab, a quote or a
  backslash in C style, with octal escapes. The parser removed the quotes
  but kept the escapes, then turned each backslash into a `/` (meant for
  Windows paths).
- **A rename has two names.** Ignore rules apply to the new one.
- **`#` at the start of a line isn't always a comment.** `git ls-files --others`
  prints `#draft.md`, or an Emacs autosave like `#notes.txt#`, without
  quotes. The box dropped both. Now only `#` followed by a space, or a bare
  `#`, counts as a comment.

The command-line version had a related problem. It reads exact names with
`git ls-files -z`, then joined them with newlines and sent them through the
same paste parser. So a file really named `back\slash.log` was checked as a
path inside a `back` folder. Now it passes the list to the engine unchanged.

The sixth find came from a seeded bug that the tests didn't catch. A `!`
rule in `.git/info/exclude`, blocked by a folder rule in the root
`.gitignore`, was flagged but never given a fix. The fix is the same line
copied into the root `.gitignore`, since git reads that file first and both
match paths from the repository root. Git agrees:

```
$ git check-ignore --no-index -v build/keep.txt
.gitignore:4:!build/keep.txt	build/keep.txt
```

## The guard

Tests written by hand only check the cases someone thought of, so the new
test asks git. It builds a repository with a modified file, a deleted file,
a renamed file and eight oddly named ones (`café.txt`, a tab, a quote, a
backslash, a `#`, a non-ASCII name in an ignored folder). It pastes git's
own `status --porcelain --ignored` and `ls-files --others` output into the
engine. Then it checks that each path comes back under the name
`git status -z` gives it, never quoted, with git's own ignored or untracked
verdict. On the old parser that test fails, and on the new one it passes.

Seeded bugs: 20 across two campaigns, and the existing tests caught 16 (80%).
The four that escaped were the `[[:print:]]` and `[[:graph:]]` character
classes, which had never been tested, an edge case in splitting a pasted
bundle, and the missing exclude-file fix above. Each now has a test that
fails with the bug in place, so the catch rate on this file is now 100%.

Results are a reading of git's documented rules, checked against one git
version. They are not a guarantee about every git build or setting.
