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

## Cutting over, then archiving the upstream repository

1. Point the scheduled routines at this repository instead of
   `oss-research-monorepo`. Their `read ./prompt.md` reaches the master
   prompt, which routes research runs to `prompts/research/`.
2. Once upstream has stopped moving, run a final sync, land it, and confirm
   `mirror.py check` exits 0 on `main`.
3. Archive `oss-research-monorepo`, and never delete it. Its pull requests,
   review threads, issues, unmerged branches and the links to them live only
   there, and no sync carries them over.
4. Delete `research/_mirror/` in a pull request. From then on, `research/` is
   simply the research portfolio and is edited here.

Do not edit mirrored files here before step 2. The next sync would overwrite
the edit, and `check` reports it as drift until then.
