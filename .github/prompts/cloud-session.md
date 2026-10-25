# Cloud sessions: the container's quirks

The cloud container's quirks, in one place: when one changes, fix it here and
nowhere else.

## GitHub: MCP tools, not `gh`

`gh`'s token is invalid, so use the GitHub MCP tools
(`search_pull_requests`, `create_pull_request`, `merge_pull_request`,
`pull_request_read`). They start **deferred**, so load them first:
`ToolSearch` with `select:mcp__github__create_pull_request,mcp__github__merge_pull_request`.

- Each request re-reads the whole context: batch independent tool calls, cap
  output (`| tail -20`), read long docs by section
  ([token flow](../../docs/reports/2026-10-20-token-flow-for-agents.md)).
- `create_pull_request` can return HTTP 500 and still create the PR. Search
  for your branch before you retry.
- To check CI, read check runs, not statuses (`verify-and-merge.md`,
  "Reading CI").
- `github.io` is unreachable from a session: the egress proxy returns 403.
  Nothing here can observe the live site.

## Shallow clones

`git merge` reports unrelated histories and branches seem to carry thousands
of commits. Content reads (`git show origin/main:<path>`) are unaffected: trust
them over history. To merge `main`, repeat `git fetch --deepen=500 origin main` until
`git merge-base HEAD origin/main` answers. To date changes,
`git fetch --shallow-since=<7 days ago> origin main && git merge --ff-only origin/main`
takes about 16 s. A full `git fetch --unshallow origin main` takes 2-15 min
and up to ~5 GB: background it, name the ref, only if you need it all.

## Python and tests

A bare `python3` often lacks `pytest`. Use `PY=$(python3 platform/ci/pyenv.py pytest)`,
then `"$PY" -m pytest`, and install with `"$PY" -m pip`, one at a time (`pip`
may belong to another Python, and two at once corrupted an install). CI runs
`python3 -m unittest discover`, so write new tests as `unittest.TestCase` or
the job finds none. Before blaming your change for a failing test (some
`gitops/tests` depend on the image), run it on `origin/main`. If `pyenv.py`
fails (PEP 668, import name differing from pip name), use
`python3 -m venv /tmp/v && /tmp/v/bin/pip install <pkgs>` in the background.

## Long commands

A foreground command times out (2 min default, 10 min at most) and foreground
`sleep` is blocked. Don't chain a long command with `git commit`/`push` (it is
auto-backgrounded and delays the commit), and use absolute paths for `rm -rf`.
Start long commands with `run_in_background`, with no `&` or subshell (the
harness would see the wrapper exit and report completion early), output to a
file, and `echo DONE` at the end. Wait with `Monitor` on an until-loop over
that file (`until grep -q DONE out.log; do sleep 5; done`). Don't grep the
process list for the script's own name: it matches itself and never ends.

- `platform/marketing/regen.mjs --verify` and the pages test suites (over 10 min)
- `node --test` over a venture (280-400 s for changepoint-detector). Node 22
  rejects `node --test .`: run `cd ventures/<slug> && node --test '*.test.mjs'`
  with `--test-force-exit` (a failing test that leaks a fake server otherwise
  hangs to the tool timeout); `venture-preflight.mjs <slug>` takes over 5 min
- browser evals such as `ai-bookkeeper/eval/browser-click.mjs`
- `run_workflow_locally.py --for-changes` (over 5 min)
- `portfolio/router/allocate.py` (35-120 s; its fetch can time out and leave
  counts partial)

## Browser and process tools

- Playwright is global at `/opt/node22/lib/node_modules/playwright` and
  Chromium at `/opt/pw-browsers/chromium`: set `PLAYWRIGHT_PATH` and
  `CHROMIUM_PATH` for scripts that read them (`ai-bookkeeper/eval/browser-click.mjs`),
  or they print "skipped: playwright not installed".
- `pkill -f <name>` kills the Bash tool's own shell, because its command
  line contains the pattern (the `pgrep` form matches itself the same way).
  `.claude/hooks/block_pkill_f.py` refuses both, also inside heredocs that
  merely mention them; use `'[n]ame'` or `kill <pid>`.
- Fresh model samples (an experiment that must not see this repo's
  instructions): `claude -p "<prompt>" --tools "" --setting-sources ""
  --model <id> --output-format json < /dev/null` from an empty scratchpad
  folder (`--bare` fails to authenticate; startup can take a minute, so batch
  in the background; `docs/reports/assets/agent-fiction/generate.sh` is an example).

## Outbound hosts

Egress is a per-environment allow-list: a host can 403 in the next session
(irs.gov, ssa.gov, OPSD/ENTSO-E, arxiv.org, sometimes huggingface.co). Probe once:
`curl -sS -o /dev/null -m 15 -w '%{http_code}\n' https://<host>/`. A proxy 403
is not the site's answer. If a figure could not be checked, say so in the PR or
run record, never cite from memory (`goals.md`: never fabricate). Proxy state:
`curl -sS "$HTTPS_PROXY/__agentproxy/status"`.

## Scheduled tasks

A task made with `create_trigger` may store no repository or connectors, so
its sessions lack the GitHub MCP tools to land a PR. If the result warns, tell the owner.
