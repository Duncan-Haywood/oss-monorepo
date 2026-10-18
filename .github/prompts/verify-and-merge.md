# Verify and merge: the traps and the post-merge steps

Moved out of `CLAUDE.md` ("Ship without review ceremony") so runs that do not
merge-check do not carry it (process backlog P017). The checklist code block
is below; the notes after it explain each line. Read it when you run that block,
touch typed-in markup, or have just merged a change to a served surface.

The checklist (moved here from `CLAUDE.md` by process backlog P030; `platform/ci/checklist_coverage.py` reads this file):

```
python3 platform/ci/checklist_coverage.py  # fails if a line below is missing
python3 platform/ci/sync_tree_counts.py  # AFTER merging main: fixes the counts a concurrent merge just invalidated
# New workflow in a PR? gitops/ci/README counts go stale: python3 gitops/ci/sync_readme_counts.py
node platform/marketing/regen.mjs --verify  # 9s, read-only: is the committed apex stale?
node platform/marketing/regen.mjs           # if that exited 1: commit whatever this rewrites (>2 min: background)
node --test platform/marketing/*.test.mjs platform/pages/*.test.mjs  # ~22 min in a cloud session (measured 2026-10-18): run_in_background
node --test platform/proposal/*.test.mjs
node --test platform/devlog/*.test.mjs
node --test platform/privacy/*.test.mjs platform/webcheck/*.test.mjs
node --test platform/deploy/*.test.mjs
node --test platform/distribution/*.test.mjs
node --test platform/llm/*.test.mjs
node --test platform/devstats/*.test.mjs
node --test platform/counter/*.test.mjs
node --test platform/uitest/*.test.mjs        # browser half skips unless PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js
node --test 'ventures/<slug>/**/*.test.mjs'   # quote it: 21 ventures keep suites in a subdirectory
python3 -m pytest gitops/tests -q        # gitops/, platform/ci/, or ANY new venture
# No pytest/numpy? PY=$(python3 platform/ci/pyenv.py pytest numpy), then "$PY" -m pytest: some images split python3 from what pip/apt install into. gitops/tests has a few failures on clean main that depend on the image (`gh` preinstalled, test_ci_runner.py): run the failing test on origin/main before blaming your change.
(cd platform/ci && rc=0; for m in test_*.py; do python3 -m unittest "${m%.py}" || { echo "FAILED $m"; rc=1; }; done; exit $rc)  # runs every module, lists each failure
(cd platform/ci/agent_review && python3 -m unittest test_review)
python3 -m pytest portfolio/ledger portfolio/scoring portfolio/router portfolio/usage portfolio/pipeline infra/tests -q
python3 -m pytest portfolio/research/<probe> -q          # one at a time: 4 share a test_measure.py basename
python3 -m pytest portfolio/pipeline/probes/<probe> -q   # one at a time: root pytest --ignore's this tree
python3 -m pytest prompts -q && python3 prompts/promptctl.py validate   # prompt.md, prompts/, run records
(cd research/<project> && PYTHONPATH=$(ls -d ../*/src | tr '\n' :) python3 -m pytest tests -q)  # research/ changes: one project at a time
python3 platform/ci/run_workflow_locally.py --for-changes  # the validators no pytest line reaches (>2 min: run_in_background)
python3 platform/ci/run_workflow_locally.py --tree          # and: is main itself green right now? (>10 min: background)
```

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

**If your change touches a page or app a user clicks through, use it the way a
user would** with [`platform/uitest`](../../platform/uitest/README.md). This
runs a real browser and no model key, and takes about 10 s for a venture and
five linked pages:

```
PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js \
  node platform/uitest/uitest.mjs --serve ventures --path /<slug>/ --crawl 5
```

It fails on JavaScript errors, dead pages and broken scripted steps, and
warns when a form takes input but nothing on the page changes. Serve
`ventures`, not `ventures/<slug>`, so sibling links resolve. With a model key
in the environment, add `--goal "<what a user comes to do>"` and an agent
works through the page and judges the result. In the PR, say what it
printed.

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
