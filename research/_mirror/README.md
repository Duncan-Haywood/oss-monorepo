# Research mirror

`research/` is an exact, history-preserving mirror of
[`Duncan-Haywood/oss-research-monorepo`](https://github.com/Duncan-Haywood/oss-research-monorepo)
until cutover. `mirror.py` keeps it that way and proves it.

```
python3 research/_mirror/mirror.py sync     # fetch upstream main, merge its history, copy its content (staged)
python3 research/_mirror/mirror.py check    # exit 0 only if research/ mirrors upstream exactly
python3 research/_mirror/mirror.py ack <upstream path>   # after porting an adapted file by hand
python3 -m unittest discover -s research/_mirror          # the tool's own tests (run in research-ci.yml)
```

## What "exact" means

`check` passes only when all of these hold:

- **History.** The last synced upstream commit is an ancestor of `HEAD`, so
  every upstream commit is in this repository's history. Projects sit at
  `research/<slug>/` in both repositories, so `git log -- research/<slug>`
  shows the original commits.
- **Copied files.** Every upstream file below is here byte for byte, with the
  same mode, and the mirrored area holds nothing else.

  | Upstream | Here |
  |---|---|
  | `research/**` | `research/**` |
  | `site/**` (except `build.py`, `template.html`) | `research/_homepage/**` |
  | `LICENSE`, `.gitignore`, `PROJECTS.md` | `research/` |

- **Derived.** `research/README.md` is this repository's header followed by
  upstream's project bullets, with `](research/` links made relative.
- **Converted.** Each line of upstream `prompts/runs.jsonl` is a record under
  `prompts/runs/`, marked `"source": "oss-research-monorepo prompts/runs.jsonl"`.
  The fields upstream wrote must match, unless a review fixed one and logged
  it in the record's `corrections`.
- **Adapted, pinned.** These describe the old repository and are maintained by
  hand. `state.json` pins the upstream blob each one was last ported from, and
  `check` fails as soon as upstream changes one.

  | Upstream | Here |
  |---|---|
  | `CLAUDE.md` | `research/CLAUDE.md` |
  | `prompt.md` | `prompts/research/prompt-0.md` |
  | `site/build.py` | `research/_homepage/build.py` |
  | `site/template.html` | `research/_homepage/template.html` |
  | `.github/workflows/pages.yml` | `.github/workflows/research-ci.yml` and `platform/pages/` |

An upstream file that fits none of these makes `check` fail and names it, so
nothing is dropped silently.

## Syncing

Until cutover, work lands upstream, and keeping this mirror current is
standing work. Whenever upstream `main` is ahead of `upstream_commit` in
`state.json`, a session brings it in. New research projects land upstream
too. A file added under the mirrored area here that upstream lacks is deleted
by the next sync. The action list is "Repository merge" in upstream's
`PROJECTS.md`.


1. Branch from `main`, then run `mirror.py sync`. It refuses a dirty tree. It
   leaves a staged merge.
2. Port each adapted change it lists (it prints the `git diff` to read), then
   run `mirror.py ack <path>` for each one.
3. Run `mirror.py check`, then `python3 research/_homepage/build.py` and
   `python3 prompts/promptctl.py validate`. Commit the merge, open a pull
   request, and merge it with a merge commit, never a squash. A squash would
   drop upstream history from `main`.

## Keeping upstream ready to delete

`mirror.py` carries `main` and its history. Everything else that lives only
upstream is kept by `archive.py`, which
[`research-archive.yml`](../../.github/workflows/research-archive.yml) runs
every day:

| Upstream | Here |
|---|---|
| branch `<name>` | branch `archive/research/<name>`, same commit |
| a pull request head no branch contains | branch `archive/research-pull/<number>` |
| pull requests, reviews, review threads, issues | JSON on the branch `archive/research-meta`, browsable from its `INDEX.md` |

Archive branches are created or moved, never deleted, and `branch_cleanup.py`,
`unlanded_work.py` and `slug_dupe.py` ignore `archive/*`.

```
python3 research/_mirror/archive.py status    # the last verdict, from the meta branch
python3 research/_mirror/archive.py branches  # what is not archived yet (--push to push it)
GITHUB_TOKEN=... python3 research/_mirror/archive.py ready --meta <export dir>
```

`ready` exits 0, and `READY.md` on the meta branch says **Yes**, only when
upstream's current `main` is the commit last synced and is in this
repository's history, every upstream
branch is archived at its current tip, every pull request and issue is
exported at its latest update, and none is still open. Deleting upstream
then loses only what no tool can copy: stars, watchers and forks, the old
Pages URL, and links to upstream pull requests from elsewhere on the web.

## Cutting over

1. Point the scheduled routines at this repository instead of
   `oss-research-monorepo` (done by the owner on 2026-10-16).
2. Merge, close or move upstream's open pull requests, then run a final
   `mirror.py sync` and land it with a merge commit.
3. Run the Research archive workflow (or wait a day) and confirm
   `archive.py status` says READY.
4. Archive or delete `oss-research-monorepo`; that is the owner's call.
   Archiving costs nothing and keeps old links working.
5. A run removes `mirror.py` and `state.json`, keeps `archive.py`'s
   README section as the record of where the old branches went, and from then
   on work lands in `research/`.
