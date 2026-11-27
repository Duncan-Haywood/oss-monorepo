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
(about 16 s). To put the work branch on current main, `git checkout -B <branch> origin/main`:
the auto-mode classifier refuses `git reset --hard origin/main`. `git fetch --unshallow origin main` takes 2-15 min and ~5 GB:
background it, only if you need it all.

## Reaching `private-monorepo` (the bets' code)

**PayApps (bet #1) is not there any more:** it moved to `ventures/payapps` on 2026-11-27
(`ventures/payapps/DEPLOY.md`). Build it in this clone; `roadmap_claim.py payapps` reads
`ventures/payapps/apps/payapps/ROADMAP.md` and claims on this repository's origin, with no
private clone. The steps below are for the bets still in `private-monorepo`.

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
   names a `register_repo_root` tool that ToolSearch does not find here; skip it); `pnpm install --frozen-lockfile --filter "{./apps/<dir>}..."`
   (from the private repo's root, `cd` there first: inside the app, even with `pnpm --dir <root>`, the filter resolves against the cwd and prints "No projects matched"; backgrounded, once per app you touch: a change to `payapps` and `payapps-site` needs both; an app with no `package.json`, such as `einvoice-preflight`, has no install step: its tests run as they stand, six reports 2026-11-25/26) gets the app's tests, `pnpm dev` and Playwright running. Select by
   directory in braces: a bare name must be the package name (cmmc's is
   `cmmc-workspace`, so `--filter cmmc...` matches nothing and exits 0), and
   `./apps/<dir>...` without braces silently drops the app's workspace deps.
   The risk review runs there from this clone's copy: `cd /home/user/private-monorepo &&
   python3 /home/user/oss-monorepo/platform/security/risk_review.py`; its
   "sensitive files" check reads *this* repo's CODEOWNERS, so check the private one by hand.
4. **Claim the item before building it.** `python3 platform/ci/roadmap_claim.py --bets`
   (about 15 s) goes through every bet in bets.md order and names the first one that has a free, ungated item.
   Six runs on 2026-11-25..26 took a crowded bet #1 and then read the ROADMAPs one by one.
   `python3 platform/ci/roadmap_claim.py <app>`
   lists the ROADMAP's Next items as free or claimed (marking ones whose text waits on
   demand, an unreachable source or the owner, and ending with the free, ungated ones); `--claim N` (with `--slug`/`--note`
   for one part of an item) pushes a create-only `claim/<app>/<slug>` branch there and
   exits 4 if another run got it first, so pick another (re-running on your own claim
   prints YOURS; an app with no ROADMAP.md, or work not on its Next list, takes `--slug` alone, no `--claim`; `--release` usually
   fails through the proxy, so let a dropped claim go stale). Open-PR checks missed this:
   private PRs 106-108 built one item within 20 minutes (backlog P079).
   The claim does not reserve a migration number, and renaming the file breaks
   drizzle's journal and snapshot chain: before merging, run
   `python3 platform/ci/migration_regen.py apps/<app>` (exit 1 on a clash), then
   merge main and rerun it with `--fix`, which takes main's `migrations/`,
   regenerates yours as the next number and diffs out any hand-written SQL to add back
   (about twenty run records, 2026-11-25..26, did this by hand). The same
   fetch usually turns up a conflict in the app ROADMAP's "Done" list, where
   parallel runs append at the same spot: keep both entries (four reports, 2026-11-25/26).

**If step 2 is refused by the permission layer** (a tool denial, not a git
error), that is final for this session: do not retry, reword, or reach the
code another way (MCP file tools, a different URL). Of the 42 run records
from 2026-11-25 that mention private-monorepo, 28 hit this refusal; the ones
that re-planned fast still shipped. Go straight to the bet's public side here
(prompt.md, step 1), on a surface the bet's `portfolio/router/allocate.py` row lists under
"none on" (its `[bet N live PRs: ...]` note reads open PR titles against the
row's `front_door:`): on 2026-11-25 four parallel runs landed in
pay-app-guides within the hour and conflicted on its shared lists. Say
"clone refused" once in the run record's `errors`; the owner-side fix is the
`private-monorepo-clone` row in `portfolio/ledger/asks.yaml`.

The PR there is opened and merged with the same MCP tools (`repo: private-monorepo`).
Its `*-ci.yml` jobs end red in 1-10 s with a 404 log (no runner, on every PR
there since at least PR 42): that is starvation, not a failure. Run them with
`python3 platform/ci/run_workflow_locally.py --repo-root /home/user/private-monorepo <app>-ci`
from this clone (it runs that workflow's `run:` steps in that checkout), put
its summary in the PR body, and merge.
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

Egress is a per-environment allow-list: one session reaches ecfr.gov, the next
gets a proxy 403 for every .gov host. Probe once, all at once:
`python3 platform/ci/egress_probe.py [word|URL ...]` (under a second) says which
hosts answer and, for a blocked one, the fallback another run verified (FAR and
DFARS clauses: GSA's source files on raw.githubusercontent.com). Add a host you
probed by hand to `platform/ci/egress_hosts.json`. In a ROADMAP item, name the source host (`wyoleg.gov`) rather than writing "403": `roadmap_claim.py` probes named hosts each run and gates the item only in sessions that refuse them. A proxy 403 is not the site's answer. Say in the PR or run record which figure could not be
checked, never cite from memory (`goals.md`). Proxy state:
`curl -sS "$HTTPS_PROXY/__agentproxy/status"`.

Help centres on Zendesk (help.whatnot.com, depophelp.zendesk.com and others) answer
WebFetch with 403, but their public article API answers curl with 200 and the full
article HTML: `https://<host>/api/v2/help_center/<locale>/articles/<id>.json` (the id is
the number in the article URL), and `.../help_center/articles/search.json?query=<words>`
finds ids. It is the vendor's own page, so it can be cited like one (2026-11-26: Whatnot's
weekly orders report columns, `private-monorepo` PR 312).

## Scheduled tasks

A `create_trigger` task may store no repository or connectors, so its sessions
lack the GitHub MCP tools to land a PR. If the result warns, tell the owner.
