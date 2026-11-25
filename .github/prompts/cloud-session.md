# Cloud sessions: the container's quirks

The cloud container's quirks, in one place: when one changes, fix it here and
nowhere else.

## GitHub: MCP tools, not `gh`

`gh`'s token is invalid, so use the GitHub MCP tools
(`search_pull_requests`, `create_pull_request`, `merge_pull_request`,
`pull_request_read`). They start **deferred**, so load them first:
`ToolSearch` with `select:mcp__github__create_pull_request,mcp__github__merge_pull_request`.

- Each request re-reads the whole context: batch independent calls, cap output
  (`| tail -20`), read long docs by section
  ([token flow](../../docs/reports/2026-10-20-token-flow-for-agents.md)).
- `create_pull_request` can return HTTP 500 and still create the PR. Search
  for your branch before you retry.
- Check CI via check runs, not statuses (`verify-and-merge.md`, "Reading CI").
- `github.io` returns 403 through the proxy: nothing here can observe the live site.

## Shallow clones

`git merge` reports unrelated histories and branches seem to carry thousands
of commits. Content reads (`git show origin/main:<path>`) are unaffected: trust
them over history. To merge `main`, repeat `git fetch --deepen=500 origin main`
until `git merge-base HEAD origin/main` answers. To date changes,
`git fetch --shallow-since=<7 days ago> origin main && git merge --ff-only origin/main`
(about 16 s). `git fetch --unshallow origin main` takes 2-15 min and ~5 GB:
background it, only if you need it all.

## Reaching `private-monorepo` (the bets' code)

A clone of `Duncan-Haywood/private-monorepo` fails until the repository is
attached to the session. Ten run records from 2026-11-24/25 say "clone refused"
and built only the bet's public side, while other runs the same day shipped
payapps there. On 2026-11-25 this worked first time:

1. `mcp__claude-code-remote__add_repo` with `owner: Duncan-Haywood`,
   `repo: private-monorepo`, `access: push` (push lets you open and merge
   the PR there).
2. One clone, inline, timeout about 10 min:
   `git clone --depth 1 https://github.com/Duncan-Haywood/private-monorepo /home/user/private-monorepo`
   (it took under a minute). Push with `git -c push.negotiate=true push -u origin <branch>`.
3. Read its `CLAUDE.md` and the app's `ROADMAP.md` by hand (add_repo's result
   names a `register_repo_root` tool that ToolSearch does not find here; skip it); `pnpm install --frozen-lockfile --filter <app>...`
   (backgrounded) gets the app's tests, `pnpm dev` and Playwright running.
4. **Claim the item before building it:** `python3 platform/ci/roadmap_claim.py <app>`
   lists the ROADMAP's Next items as free or claimed; `--claim N` (with `--slug`/`--note`
   for one part of an item) pushes a create-only `claim/<app>/<slug>` branch there and
   exits 4 if another run got it first, so pick another. Open-PR checks missed this:
   private PRs 106-108 built one item within 20 minutes (backlog P079).

**If step 2 is refused by the permission layer** (a tool denial, not a git
error), that is final for this session: do not retry, reword, or reach the
code another way (MCP file tools, a different URL). Of the 42 run records
from 2026-11-25 that mention private-monorepo, 28 hit this refusal; the ones
that re-planned fast still shipped. Go straight to the bet's public side here
(prompt.md, step 1), on a surface the bet's `allocate.py` row lists under
"none on" (its `[bet N live PRs: ...]` note reads open PR titles against the
row's `front_door:`): on 2026-11-25 four parallel runs landed in
pay-app-guides within the hour and conflicted on its shared lists. Say
"clone refused" once in the run record's `errors`; the owner-side fix is the
`private-monorepo-clone` row in `portfolio/ledger/asks.yaml`.

The PR there is opened and merged with the same MCP tools (`repo: private-monorepo`).
Its `*-ci.yml` jobs fail in about 10 s with no steps and no logs (no runner, as on
every payapps PR since at least PR 42 there): run the workflow's steps locally,
put the output in the PR body, and merge.
The run record still lands here, in a PR of its own if nothing else changed.

## Python and tests

A bare `python3` often lacks `pytest`. Use `PY=$(python3 platform/ci/pyenv.py pytest)`,
then `"$PY" -m pytest`, and install with `"$PY" -m pip`, one at a time (`pip`
may belong to another Python, and two at once corrupted an install). CI runs
`python3 -m unittest discover`, so write new tests as `unittest.TestCase` or
the job finds none. Before blaming your change for a failing test (some
depend on the image), run it on `origin/main`. If `pyenv.py`
fails (PEP 668, import name differing from pip name), use
`python3 -m venv /tmp/v && /tmp/v/bin/pip install <pkgs>` in the background.
Name every module you need in the one call (`pyenv.py pytest numpy torch`) and run
with `"$PY"`: a torch-free `python3` passes for pytest/numpy alone, and a later bare
`pip install torch` lands in another interpreter (30 min lost, 2026-10-26). Torch-class
installs (CPU wheel since 2026-10-28) take a few min: `run_in_background`, and the path is the last stdout line.

## Long commands

A foreground command times out (2 min default, 10 min at most) and foreground
`sleep` is blocked. Don't chain a long command with `git commit`/`push` (it is
auto-backgrounded and delays the commit); use absolute paths for `rm -rf`.
Start long commands with `run_in_background`, no `&` or subshell (the harness
would report completion early), output to a file, `echo DONE` at the end. Wait
with `python3 platform/ci/wait_for.py out.log` (up to 100 s per call, exit 1 means
still running: call again; for a job with no output, e.g. a pip install, use
`--until "python3 -c 'import torch'"`; for a job of many minutes, run wait_for itself with
`run_in_background` and `--timeout 3600`: you are woken once when it exits (read the log afterwards; do not pipe it or chain an echo); `sleep` loops and Monitor have been blocked). Don't grep
the process list for the script's own name: it matches itself and never ends.

- the pages test suites (over 10 min)
- `node --test` over a venture (280-400 s for changepoint-detector). Node 22
  rejects `node --test .`: run `cd ventures/<slug> && node --test '*.test.mjs'`
  with `--test-force-exit` (a failing test that leaks a fake server otherwise
  hangs to the tool timeout); `venture-preflight.mjs <slug>` takes over 5 min
- browser evals such as `ai-bookkeeper/eval/browser-click.mjs`
- `run_workflow_locally.py --for-changes` (over 5 min)
- `portfolio/router/allocate.py` (35-120 s; a timed-out fetch leaves counts partial)

## Browser and process tools

- Playwright is global at `/opt/node22/lib/node_modules/playwright` and
  Chromium at `/opt/pw-browsers/chromium`: set `PLAYWRIGHT_PATH` and
  `CHROMIUM_PATH` for scripts that read them (`ai-bookkeeper/eval/browser-click.mjs`),
  or they print "skipped: playwright not installed".
- `pkill -f <name>` kills the Bash tool's own shell, because its command
  line contains the pattern (the `pgrep` form matches itself the same way).
  `.claude/hooks/block_pkill_f.py` refuses both, also inside heredocs that
  merely mention them; use `'[n]ame'` or `kill <pid>`. A bracketed pattern
  still kills the shell when the plain `name` appears elsewhere in the same
  command (a `nohup name ...` on the same line); the hook refuses that too, so
  run the kill in its own call.
- Fresh model samples with no repo instructions (`claude -p --tools "" --setting-sources ""`):
  recipe in `docs/reports/assets/agent-fiction/README.md`.

## Outbound hosts

Egress is a per-environment allow-list (irs.gov, ssa.gov, OPSD/ENTSO-E,
arxiv.org, sometimes huggingface.co 403). Probe once:
`curl -sS -o /dev/null -m 15 -w '%{http_code}\n' https://<host>/`; a proxy 403
is not the site's answer. Say in the PR or run record which figure could not be
checked, never cite from memory (`goals.md`). Proxy state:
`curl -sS "$HTTPS_PROXY/__agentproxy/status"`.

## Scheduled tasks

A `create_trigger` task may store no repository or connectors, so its sessions
lack the GitHub MCP tools to land a PR. If the result warns, tell the owner.
