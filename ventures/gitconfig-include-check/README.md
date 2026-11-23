# gitconfig includeIf checker

A free tool that reads your git config files the way git does and tells you,
for one repository, **which `[include]` and `[includeIf]` lines took effect,
why each of the others did not, and which file and line set `user.email`**,
your signing key and every other value. The usual setup keeps a personal
address in `~/.gitconfig` and switches to a work one under `~/work/` with
`[includeIf "gitdir:~/work/"]`; when that fails git says nothing, and you find
out from a commit with the wrong name on it.

**Live tool:** https://marisstella.app/gitconfig-include-check/
· **Guide:** [`why-git-uses-the-wrong-email.html`](why-git-uses-the-wrong-email.html)

**Who it is for:** developers with separate work and personal identities,
signing keys or SSH commands, and the people who write dotfiles and onboarding
docs that set them up.

| Kind | Severity | What it flags |
| --- | --- | --- |
| `git-stops` | error | a line that makes every git command fail with `bad config line N in file F`, an include chain over 10 deep, a remote URL inside a conditional include when `hasconfig:` is used |
| `gitdir-no-trailing-slash` | high | `gitdir:~/work`: without `/` it must equal the whole `.git` path; the tool says what the slash would match |
| `gitdir-names-work-tree` | high | `gitdir:~/work/api`: names the folder you cd into, not its `.git` |
| `include-overridden` | high for identity keys, else medium | a value from an include that a later line replaces (the include sits above `[user]`), with the line that wins |
| `unknown-condition` | high | `GitDir:`, `onBranch:`, `hasconfig:remote.origin.url:` and other conditions git treats as false, with the likely intended one |
| `condition-whitespace`, `gitdir-backslash`, `gitdir-env-var` | high when it stops a match | spaces, Windows backslashes and `$HOME` inside a condition |
| `gitdir-case` | medium | a pattern that matches only if case is ignored: use `gitdir/i:` |
| `gitdir-symlink` | high | matches the typed path but not the real one, so it applies at the top of the repository and not in a subfolder, with `git -C`, or in most editors |
| `include-target-missing`, `include-env-var` | high / medium | `path =` names a file that is not there (git skips it silently), or uses `$HOME` |
| `includeif-not-path`, `include-not-path` | high | `file =` under `[includeIf]`, `[include "x"]`: stored and ignored |
| `file-never-read` | medium | a pasted file no include reaches |
| `key-without-section` | high | `email = x` above the first `[section]` |
| `onbranch-refs-prefix`, `onbranch-detached` | high / info | `onbranch:refs/heads/main`; `onbranch:` on a detached HEAD (CI, bisect, rebase) |
| `hasconfig-scheme` | medium | an `https://` pattern for an `git@host:` remote, or the reverse |
| `gitdir-relative`, `linked-worktree` | low / info | `gitdir:work/` matches at any depth; a linked worktree's `.git` lives in the main repository |

## How it works

`gitconfig.mjs` is a reimplementation, from git's documentation and observed
behaviour, of the parts of git's `config.c` that matter here. No git source is
copied.

- **Parsing:** `git_parse_source`, `get_base_var`, `get_extended_base_var`,
  `get_value` and `parse_value`: case-folded section and key names, quoted
  subsections with `\` escapes, keys on the header line, `#`/`;` comments,
  quotes, `\n \t \b \\ \"` escapes, line continuations, whitespace runs, CRLF,
  a UTF-8 BOM, and git's line numbers for errors.
- **Reading order:** system, `$XDG_CONFIG_HOME/git/config`, `~/.gitconfig`,
  the shared `.git/config`, then `config.worktree` when
  `extensions.worktreeConfig` is on. An include is read where its line is, and
  the last value of a key wins.
- **Includes:** `include.path` and `includeIf.<condition>.path`; `~/`
  expanded, relative paths taken from the including file's folder, missing
  files skipped, depth limit 10.
- **Conditions:** `gitdir:` and `gitdir/i:` (`~/` and `./` expansion, `**/` in
  front of a relative pattern, `**` after a trailing `/`, the literal prefix
  for `./`, matched with `wildmatch` and `WM_PATHNAME` against the real path
  and then the typed one); `onbranch:` against the short branch name, false on
  a detached HEAD; `hasconfig:remote.*.url:` against the remote URLs that the
  hidden first pass (`populate_remote_urls`) collects, with git's rule that a
  file under any true `includeIf` may not set one. Unknown conditions are false.
- **Two hidden reads:** every git command first reads the system and global
  files with no repository (trace2's very early config read), then parses
  `.git/config` alone to check the repository format. A bad line in either is
  where git stops, before the main read; found by the differential test.
- The `wildmatch` port is this repository's own, from
  [`../gitignore-explainer`](../gitignore-explainer/README.md) (same MIT licence).

### How it was checked

- `gitconfig.diff.test.mjs` builds random homes and repositories: random
  `~/.gitconfig`, `~/.config/git/config`, `.git/config` and up to four included
  files, with 33 conditions (good and broken), nine path forms, quoted and
  escaped values, comments, keys on header lines, broken lines, include cycles,
  remote URLs, branches and detached HEADs, and linked worktrees with and
  without `config.worktree`. It requires the engine to produce exactly the
  lines `git config --list --show-origin --show-scope` prints, in order, and
  when git stops, the same file and line. 150 trees by default; the numbers
  of longer runs are in "Results".
- `gitconfig.test.mjs` pins each finding, the parser, and the symlink case
  against real git (an include through a symlinked `~/work` applies in the
  repository's top folder and not in a subfolder).
- `cli/check.mjs --verify` runs the same comparison against your own git.

### Results

On git 2.43.0 (Linux), seeds 1 to 3,000: no difference (1,777 trees with
settings, 708 of them with a matching `includeIf`, 461 stopping on a bad line,
43 on the depth limit and 11 on the `hasconfig` remote-URL rule). A
5,000-tree run with seeds 10,001 to 15,000 is recorded in the run record of
the pull request that added this tool.

Two behaviours surfaced only because the test compared against git: the
early system-and-global read and the `.git/config` format check, which decide
which broken line git reports first.

**Spec sources:** git-config(1) ("Includes", "Conditional includes"), git's
`config.c`, `path.c` (`interpolate_path`) and `abspath.c`
(`strbuf_add_absolute_path`) as the reference behaviour, and git itself as the
oracle. The professional who would sign this off is a developer-experience or
platform engineer who owns a company's git onboarding.

**Limits:** Unix paths only: Windows drive letters, `%(prefix)/` and `~user/`
are not evaluated (the tool says so). Command-line `-c` and `GIT_CONFIG_*`
environment settings are not modelled. Case-insensitive file systems are not
modelled beyond `gitdir/i:`. Bracket ranges that straddle letter case under
`gitdir/i:` (`[Z-a]`) may differ from git.

## Use it

- **Web:** paste your files (`head -n 9999 ~/.gitconfig ~/.gitconfig-* .git/config`
  prints them with the `==> path <==` headers the page reads), your home folder,
  the repository folder and the branch, and press Check.
- **CLI:** from inside a repository, `node ventures/gitconfig-include-check/cli/check.mjs`
  (`--key user.email`, `--verify`, `--json`, `--strict` to exit 1 on a high
  finding, `--repo <dir>`). It finds the `.git` folder, its real path, the
  branch and every included file itself. No dependencies, no network. Node 18+.
- **Agents:** `analyze(...)`, `why(...)` and `listing(...)`; see `llms.txt`.

## Privacy

Everything runs in your browser. What you paste is never uploaded; there are no
accounts, cookies or analytics vendors. Four anonymous events
(`config_checked`, `example_loaded`, `why_shown`, `report_downloaded`) are
counted in local storage on your device only, never with your data, and are
off under Do Not Track or with the switch on the page.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, security or professional advice, and
it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, for example with
`git config --show-origin --get-all user.email`. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

Not affiliated with or endorsed by the Git project, GitHub or GitLab. Git is a
trademark of the Software Freedom Conservancy.

## Tests

```
node --test gitconfig.test.mjs gitconfig.diff.test.mjs page.test.mjs usage.test.mjs cli/check.test.mjs
GITCONFIG_DIFF_TRIALS=5000 node --test gitconfig.diff.test.mjs   # the long run
```

MIT licence. Support is optional: https://github.com/sponsors/Duncan-Haywood
