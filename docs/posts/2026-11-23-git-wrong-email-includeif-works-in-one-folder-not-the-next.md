---
title: "Git used the wrong email: an includeIf that works in one folder and not the next"
seo_title: "git includeIf not working, wrong email in work repos: a free checker"
date: 2026-11-23
tags: [git, gitconfig, developer-tools, open-source]
description: "A free checker that reads ~/.gitconfig the way git does, tested against git, and a symlink case where includeIf depends on the folder git runs in."
---

[gitconfig includeIf checker](../../ventures/gitconfig-include-check/) is a new free
tool, [live here](https://marisstella.app/gitconfig-include-check/). The usual setup
keeps a personal address in `~/.gitconfig` and switches to a work address, signing
key or SSH command for repositories under `~/work/`:

```
[user]
	email = sam@personal.example
[includeIf "gitdir:~/work/"]
	path = ~/.gitconfig-work
```

When that fails, git prints no warning. The condition is false, or the file is
missing, or a later line wins, and you find out from a commit with the wrong name
on it. You paste your config files and say where the repository is. The tool
lists every include line, says whether git reads it there and why, and names
the file and line that set `user.email` and every other value. There is also a
command-line version that reads the files on your machine and checks its answer
against your own git (`--verify`).

## How we know it says what git does

The engine is a reimplementation of the parts of git's `config.c` that decide
this: the parser, the reading order, `include.path`, the four `includeIf`
conditions (`gitdir:`, `gitdir/i:`, `onbranch:`, `hasconfig:remote.*.url:`) and
git's rewriting of `gitdir:` patterns. It was written from git's documentation
and observed behaviour, and no git source was copied. A differential test builds
random homes and repositories: `~/.gitconfig`, the XDG config, `.git/config` and
up to four included files, drawing from 33 conditions (good and broken), nine
path forms, quoted and escaped values, comments, include cycles, broken lines,
remote URLs, branches, detached HEADs and linked worktrees. Each tree is read
by the engine and by `git config --list --show-origin --show-scope`. The two
outputs must match line for line, and when git stops on an error, both must
name the same file and line.

On git 2.43.0, seeds 1 to 3,000 were used while building and ended with no
difference. A further 5,000 seeds that were not used while building are
reported in the [run record](../../prompts/runs/) of the pull request that added
the tool.

## What the comparison taught us

The first 217 trees agreed. Seed 218 did not: the engine blamed a broken line
inside an included file, and git blamed a different line in `~/.gitconfig`.
Every git command reads your system and global config once **before** it looks
for a repository, so `gitdir:` conditions are all false on that read. A broken
line in `~/.gitconfig` therefore stops git before any repository-specific include
is opened. Seed 1,788 found a second hidden read: git parses `.git/config` on its
own, with no includes, to check the repository format. Neither read changes which
values you end up with. Both change which error git reports first, and so where
you should look first.

## The symlink case

The most surprising result was outside the random test. If `~/work` is a
symlink to `/mnt/data/work`, does `gitdir:~/work/` match? git first tries the
real path of the `.git` folder, then the path as typed. But it only knows the
typed path when `$PWD` names the folder git is running in, which is true at the
top of the work tree. We ran it with git 2.43:

| Where git runs | `gitdir:~/work/` applied? |
| --- | --- |
| top folder of the repository, after `cd` through the link | yes |
| a subfolder of the same repository | no |
| `git -C ~/work/api` from elsewhere | no |
| top folder with `PWD` unset | no |

So the same repository commits with the work address from its root and the
personal one from `src/`. Editors, hooks and GUIs usually see only the real
path. When you give the tool the real path, it flags the include as "matches
only through a symlink, so only sometimes" and suggests a second block for the
real location.

## The common ones

The [guide](https://marisstella.app/gitconfig-include-check/why-git-uses-the-wrong-email.html)
has six, each checked against git:

- `gitdir:~/work` with no trailing slash must equal the whole `.git` path, so
  it matches nothing below `~/work`. `gitdir:~/work/api` names the work tree,
  not its `.git`.
- If the `[includeIf]` block sits **above** `[user]`, the work address is read
  first and the personal one replaces it. `git config --show-origin --get-all
  user.email` shows both, and the last one wins.
- `GitDir:`, `hasconfig:remote.origin.url:` and `"gitdir: ~/work/"` (with the
  space) are all silently false.
- `path = $HOME/.gitconfig-work` looks for a folder literally named `$HOME`, and
  git skips a missing file without a word.
- `onbranch:` never matches on a detached HEAD, which is how most CI systems
  check out a pull request.

## Limits

Only Unix paths are handled. Windows drive letters, `~user/` and `%(prefix)/`
are not evaluated, and the tool says so. Command-line `-c` settings and
`GIT_CONFIG_*` variables are not modelled. The comparison ran on one git version
(2.43.0) on Linux. The page runs in your browser, nothing you paste is uploaded,
and the code is MIT licensed.

If people use it, the next step is to run the same test against more git
versions and to add the Windows path rules.
