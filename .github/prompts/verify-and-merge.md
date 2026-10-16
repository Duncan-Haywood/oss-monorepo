# Verify and merge: the traps and the post-merge steps

Moved out of `CLAUDE.md` ("Ship without review ceremony") so runs that do not
merge-check do not carry it (process backlog P017). The checklist code block
stays in `CLAUDE.md`; this file explains it. Read it when you run that block,
touch typed-in markup, or have just merged a change to a served surface.

What the lines are for, and the traps in running them:

- **`checklist_coverage.py`** fails when a test directory exists that this
  block does not name, or when the venture glob cannot reach a venture's
  tests. If it fails, add the line it prints in the same commit. Quote the
  venture glob: unquoted, bash turns `**` into `*`, and `node --test` on a
  glob that matches nothing prints `# pass 0` and exits 0.
- **`sync_tree_counts.py`** after merging `main`: two counts (mirrored tools,
  `SWITCHES_IN_THE_CATALOGUE`) are only knowable at the merge, because
  parallel branches each bump them. It rewrites the numbers; you write the
  one-line reason.
- **`regen.mjs --verify`** (about 9 s) says whether the committed front-door
  mirror is stale. Exit 1 means run bare `regen.mjs` and commit what it
  rewrites. Exit 2 means it could not answer. Never run it from a test or in
  parallel with the marketing suites, because it rewrites `gitops/prod/` for
  a few seconds. Skipping this step is the most common way a venture fix
  ships to the venture page but not to the apex copy users see.
- **Validators no test imports** (`router/validate.py`,
  `validate_doc_consistency.py`, `score_ventures.py --check` and others)
  run through `run_workflow_locally.py`. `--for-changes` covers your diff.
  `--tree` asks whether `main` itself is green, and an empty selection exits
  1. Steps whose tool is missing report `UNRUN`, not `FAILED`: install what
  they name and rerun before you call the tree green.
- **Use `python3 -m <tool>`** (pytest, mypy, pip), never the bare name: in
  web sessions the bare names are `uv tool` shims with a different
  interpreter, and they report missing modules as failures. When a workflow
  step spells a tool bare, run both before you believe the red.
- **Installing:** `PY=$(python3 platform/ci/pyenv.py pytest numpy)` prints an
  interpreter that imports them, installing with `<it> -m pip` or apt only if
  none does; then run `"$PY" -m pytest`. Some images put a bare python3 first
  on PATH while pip and apt install into `/usr/bin/python3`. For any apt
  install, `apt-get update &&` is load-bearing (the index is stale). For the nginx and ssh suites
  that otherwise skip:
  `apt-get update && apt-get install -y --no-install-recommends nginx-light openssh-client`,
  then `python3 platform/ci/guard_state.py --require-runnable` lists what
  still skips and why. A skip is a green that means nothing ran.
- **Long suites**: the `platform/pages`, `marketing` and `deploy` node suites
  can run past the tool limit (10 min; `git fetch --unshallow` and
  `publish-branch.sh` too). Start each with `run_in_background` and read the
  result when it finishes; do not chain them.
- **`platform/ci` suites** import by bare module name, so run them from
  inside that directory as the line does. `python3 -m pytest platform/ci`
  from the root fails collection.
- **Shallow clones**: two `platform/webcheck` tests pin historic blobs and
  skip in a shallow clone. Run `git fetch --unshallow origin main` if you
  want them to run.
- **The `gitops/tests` line applies whenever your commit touches
  `gitops/`**, including the hundreds of files `regen.mjs` rewrites when a
  venture gains a page. The condition is about what the commit contains, not
  what you edited on purpose.

**If your change touches markup a user types into, run the browser checks:**

```
python3 platform/ci/browser_state.py               # has anyone run these lately?
npm install --no-save playwright@1.56.0 axe-core   # both in ONE command
python3 platform/ci/browser_checks.py --only <slug>
```

`playwright@1.56.0` matches the preinstalled Chromium at `/opt/pw-browsers`.
Never run `npx playwright install`, which downloads a second browser and can
fill the disk. Install both packages in one command, because a second
`--no-save` install prunes the first. Add `--record` to a full (not `--only`)
run to write the reading. The first full run, on 2026-09-06, found 48
critical accessibility violations that every other check had passed.

**After you merge a change that touches a served surface, refresh the
published snapshot:**

```
python3 platform/ci/pages_state.py --require-current   # exits 1 if it is stale
CONFIRM=publish-pages-branch PUSH=1 ./platform/pages/publish-branch.sh
python3 platform/ci/pages_state.py --require-current   # and 0 once you have
python3 platform/ci/pages_state.py --record            # commit only on a branch that ships work (land-your-work.md, step 7)
python3 platform/ci/indexnow_state.py                  # and: was any of it announced?
```

The `gh-pages` branch is a committed artifact, and nothing rebuilds it when
`main` moves. `publish-pages-branch.yml` does it automatically only once the
owner sets `PAGES_BRANCH_PUBLISH=true` (process backlog P005). If the
publish refuses with "publishing backwards", another session published
first: run `git fetch origin main && git reset --hard origin/main` and
rerun. Never use `ALLOW_REGRESSION=1` except for a deliberate rollback.
`--record` keeps `decision_queue.py` from printing a false OUTAGE banner
once a reading is more than three days old. Do not widen the ageing rule to
silence the banner.
