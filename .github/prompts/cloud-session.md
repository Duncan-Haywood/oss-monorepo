# Cloud sessions: the container's quirks

The facts about the cloud container that runs most sessions, in one place.
They used to be scattered through `CLAUDE.md`, `land-your-work.md` and
`verify-and-merge.md`, and run records kept reporting them as friction
(`gh`, shallow clones, missing `pytest`, commands that outlast the foreground
limit). When one of these changes, fix it here and nowhere else.

## GitHub: MCP tools, not `gh`

`gh` is installed, but its token is invalid (`gh auth status` fails), and
`gh pr list` costs a call to learn that. Use the GitHub MCP tools
(`search_pull_requests`, `create_pull_request`, `merge_pull_request`,
`pull_request_read`). They start **deferred**, so load them first:
`ToolSearch` with `select:mcp__github__create_pull_request,mcp__github__merge_pull_request`.

- `create_pull_request` can return HTTP 500 and still create the PR. Search
  for your branch (`head:` or the title) before you retry. It has succeeded
  on the third call.
- To check CI, read check runs, not statuses (`verify-and-merge.md`,
  "Reading CI").
- `github.io` is unreachable from a session: the egress proxy returns 403.
  Nothing here can observe the live site.

## Tokens

Each request re-reads the whole context (about 81,000 tokens in a median
run), so batch independent tool calls, cap tool output (`| tail -20`) and
read long docs by section. Measured basis and the full list:
[`docs/reports/2026-10-20-token-flow-for-agents.md`](../../docs/reports/2026-10-20-token-flow-for-agents.md).

## Shallow clones

`git merge` reports unrelated histories, and every branch seems to carry
thousands of commits. Content reads (`git show origin/main:<path>`) are
unaffected, and most sessions need nothing more. When the two disagree,
trust the content. Fetch history only for a step that needs it, such as
merging `main` into a branch or dating a change. Try
`git fetch --deepen=500 origin main` first, and repeat until
`git merge-base HEAD origin/main` answers. In recent runs a full
`git fetch --unshallow origin main` took 2-15 min and up to ~5 GB, and two
`Monitor` waits expired at 20 min before one finished. So run it with
`run_in_background` only when you need all of it. Name the ref, because a
bare `--unshallow` skips a ref you fetched by name. Then check that
`git rev-list --count origin/main` is in the thousands, not 1.

## Python and tests

A bare `python3` often lacks `pytest` and can shadow pip packages with apt
ones. Use `PY=$(python3 platform/ci/pyenv.py pytest)`, then
`"$PY" -m pytest`. Some `gitops/tests` failures depend on the image. Before
blaming your change, run the failing test on `origin/main`.
`pip` may belong to python3.13 while `python3` is 3.11: install with
`"$PY" -m pip`, and never run two pip installs at once (one corrupted an install).

## Long commands

A foreground command times out (2 min by default, 10 min at most), and
foreground `sleep` is blocked.
Start these with `run_in_background` and wait with `Monitor`:

- `node platform/marketing/regen.mjs --verify` and the pages test suites
  (over 10 min in a shallow clone)
- `node --test` over a whole venture (changepoint-detector alone: 280-400 s)
    and `node platform/pages/venture-preflight.mjs <slug>` (over 5 min)
- `python3 platform/ci/run_workflow_locally.py --for-changes` (over 5 min)
- `python3 portfolio/router/allocate.py` (35-120 s; its shallow-clone fetch
  can time out and leave counts partial)
- a full unshallow (above)

## Browser and process tools

- Playwright is global at `/opt/node22/lib/node_modules/playwright` and
  Chromium at `/opt/pw-browsers/chromium`: set `PLAYWRIGHT_PATH` and
  `CHROMIUM_PATH` for scripts that read them (`ai-bookkeeper/eval/browser-click.mjs`),
  or they print "skipped: playwright not installed".
- `pkill -f <name>` kills the Bash tool's own shell, because its command
  line contains the pattern. `.claude/hooks/block_pkill_f.py` now refuses it
  (also inside heredocs that merely mention it); use `'[n]ame'` or `kill <pid>`.

## Scheduled tasks

A scheduled task created from a cloud session (`create_trigger`) may store
no repository source and no connectors. Its sessions can then lack the
GitHub MCP tools they need to land their PR. Read the tool's result, and tell
the owner if it warns about this.
