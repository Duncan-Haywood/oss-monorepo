---
title: "The .gitignore line git never reads, and a ** rule that changed in git 2.52"
seo_title: "Why a .gitignore negation does nothing, and a ** change in git 2.52"
date: 2026-11-11
tags: [gitignore-explainer, developer-tools, testing, git]
description: "A free tool that names the rule deciding every path, as git does. Testing it against two gits found that ** after text changed meaning in 2.52."
---

Most people meet this one sooner or later:

```
build/
!build/keep.txt
```

The second line does nothing. Git walks the tree one folder at a time, and when `build/` matches the folder it skips it. The files inside are never listed, so a rule about `build/keep.txt` never gets compared with anything. `git check-ignore -v build/keep.txt` reports line 1, `build/`. It does not mention that your negation was defeated.

The new [.gitignore Explainer](../../ventures/gitignore-explainer/) takes your ignore files and a list of paths and names the rule that decides each one. It flags every negation that a parent folder blocks, including one written in a `.gitignore` inside an ignored folder, which git never reads at all. Then it writes the lines that fix it: `!/build/`, `/build/*`, then the negation again. Before offering them it re-runs every path with the lines added. It reports how many come back, how many stay ignored, and which other paths change. It also lists tracked files that your rules match but cannot affect. Those are the files that keep showing up in `git status` after you added them to `.gitignore`. It runs in the browser, and a zero-dependency command-line version reads a whole repository.

## Checking it against git

A tool that explains git's answer is only useful if it agrees with git, so the engine is tested against git itself. The test builds a random repository: a random tree up to four folders deep, plus random rules from pieces like `*`, `**`, `[!a]`, `[[:alpha:]]`, `\*` and an unclosed `[`. Nested `.gitignore` files and `.git/info/exclude` are mixed in. It runs `git check-ignore --no-index -v -n` on every file and folder and requires the same deciding file and line.

The first 18 random repositories agreed. The 19th did not. The rule was `/a**/*.c` and the path `a.c/ab/b.c/b.c`. By the documented rules, a `**` glued to other characters acts like a single `*` and stops at a slash, so the rule should not match. Git said it did.

The reason is a speed shortcut in git. Before wildcard matching, git compares the literal part of an anchored pattern, everything before the first `*`, `?`, `[` or `\`, as plain text. It then matches only the rest, and it treated that rest as a pattern of its own. So `/a**/*.c` became "starts with `a`" plus `**/*.c`. That `**` then sat at the start of a pattern, which counts as a whole segment, so it crossed folders.

Then the pull request went to CI, which runs git 2.56, and the test failed the other way: newer git did *not* match. Checking git's `dir.c` at each release tag showed why. Git 2.52.0 changed the shortcut to keep one character of the prefix when it hands over, "which lets it distinguish the start of a directory component correctly". On 2.52 and later, `a**` acts like `a*` again, as the documentation says. So the same `.gitignore` gives a different answer on Ubuntu 24.04's git 2.43 than on a current release. It only matters for a `**` glued to literal text, which nobody should write, but a tool that explains git's answer has to give the right one. The engine now has both behaviours. The page asks which git you run, the CLI reads `git --version`, and the differential test picks the mode from the git it finds.

With that in place, in this container (git 2.43.0, old behaviour):

- 4,000 random repositories, 63,578 paths and folders: every one agrees with git.
- This repository's own 73 ignore files (391 rules) over its 55,196 tracked files and 8,443 folders: 0 disagreements. Only 16 of those 63,639 paths match any rule at all, which is what you'd expect of tracked files. So this run says little about the hard cases; the random runs carry those.
- A second test applies each suggested fix in git and checks that git does what the report claimed. Across 8,000 random repositories that was 1,294 fixes, all as reported. 1,142 brought back every blocked path, and 1,219 changed no other path. The random rules are deliberately odd, so read those rates as a stress figure. They are not a forecast for normal files.

## What it found here

Run on this repository, the report has no blocked negations and no lint errors. It does find a handful of rules that never decide anything in the tracked list. Most are the normal "ignore all, keep a few" idiom, such as `.env.*` followed by `!.env.example`, which is shadowed when the list holds only the examples. The tool says so in the finding. One is really redundant. `ventures/retail-pilot-intel/.gitignore` has `.cursor/*`, `!.cursor/rules/` and `!.cursor/rules/**`. The third line adds nothing: `.cursor/*` never matched the files inside `rules/`, only the folder, and the second line already took that back.

## Limits

The tool reimplements git's rules; it does not run git. CI repeats the random-repository test on git 2.56 for the new behaviour on every change. Matching is case-sensitive, as on Linux. It does not read your global excludes file, though you can paste it in as `.git/info/exclude`, which gets the same lowest precedence. Rules that "match nothing in your list" are evidence about your list, not proof a rule is dead. Check anything that matters with `git check-ignore -v`.

Next, if people use it: a GitHub Action wrapper around `--strict`, so a pull request that adds a negation git will never read fails before merge.
