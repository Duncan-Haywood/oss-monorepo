---
title: "In a .gitignore, ? matches a byte, not a letter: café.txt slips past caf?.txt"
seo_title: "In a .gitignore, ? matches a byte, not a letter"
date: 2026-11-16
tags: [ventures, gitignore-explainer, git, testing]
description: "Git matches .gitignore wildcards byte by byte. é is two bytes in UTF-8, so ? and [...] see half a letter. Our explainer got this wrong until we tested it."
---

Put this line in a `.gitignore`:

```
caf?.txt
```

You might expect it to ignore `café.txt`. It doesn't. Try it:

```
$ printf 'caf?.txt\n' > .gitignore
$ git check-ignore --no-index -v café.txt || echo "not ignored"
not ignored
```

Git's wildcard matcher (`wildmatch`) works on **bytes**, not letters. In UTF-8,
`é` is two bytes (`0xC3 0xA9`). The `?` takes the first one, then `.` has to
match `0xA9`, so the match fails. The same goes for brackets: `n[!a]o` does not
ignore `néo`, because `[!a]` takes a single byte and `o` then lands on the
second half of the `é`. A `*` is fine, because it can take any number of
bytes, so `b*z` still ignores `bé.z`. And `caf??.md` *does* ignore `café.md`.

The documentation doesn't spell this out, so we checked it against git
2.43. Names with accents, CJK characters or emoji are common in real
repositories, so this is worth knowing whenever a pattern uses `?` or `[...]`
next to them.

## How we found it

The [.gitignore Explainer](https://marisstella.app/gitignore-explainer/) tells
you which rule decides each path, the way git would. Its matcher is a port of
git's, written in JavaScript, where a string is a sequence of characters, not
bytes. So `?` took the whole `é`, and the Explainer reported `café.txt` as
ignored when git leaves it alone: a wrong answer, given confidently.

A red-team run caught it. These runs seed small faults into a file to see
whether the tests notice. That campaign hit 12 spots in the matcher and the
tests caught only 5. While adding tests for the misses, we asked what a
stranger's input could do that the random differential test never tries.
That test compares the Explainer with `git check-ignore` on hundreds of random
repositories, but every name in it was ASCII.

## The fix and the guard

The matcher now converts a non-ASCII pattern and path to their UTF-8 bytes
before matching. ASCII-only input, almost every real rule, skips the step.
The fast paths for plain names and `*.ext` rules are unaffected, because
comparing whole strings gives the same answer as comparing their bytes.

The guard is a second differential test that builds 150 random repositories
from names like `é`, `aé` and `日`, with patterns like `?é`, `[é]`, `[a-é]`
and `???`, and checks every path against git. It agrees with git on all 2,204
paths. Without the fix it fails on the first trial that hits the
difference.

The same run added tests for five other blind spots the seeded faults
exposed: `[[:cntrl:]]` and `[[:graph:]]` at the DEL character, every C escape
in a quoted `git status` path, and which file gets the suggested fix when
two choices are equally good. Of the 12 seeded faults, the tests now catch
every one that can change an answer (two turned out to be dead code).

The Explainer is free, open source (MIT) and runs entirely in your browser:
[marisstella.app/gitignore-explainer](https://marisstella.app/gitignore-explainer/).
