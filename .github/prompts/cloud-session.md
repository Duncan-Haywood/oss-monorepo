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
`"$PY" -m pip`, and run one pip install at a time (two at once corrupted an install).
If `pyenv.py` fails (PEP 668, or a package whose import name differs from its
pip name, e.g. OpenDSSDirect.py), skip it: `python3 -m venv /tmp/v && /tmp/v/bin/pip install <pkgs>`,
in the background (it can exceed 120 s).

## Long commands

A foreground command times out (2 min by default, 10 min at most), and
foreground `sleep` is blocked. A long command chained with `git commit`/`push` in one call gets auto-backgrounded and delays the commit, so keep them separate; the safety check rejects `rm -rf` on relative globs after a `cd`, so absolute paths work better.
Start these with `run_in_background` and wait with `Monitor`. Leave `&` and
subshells out of the command: the harness then sees the wrapper exit
at once and reports completion while the job still runs (two friction reports,
2026-10-23). Run the command itself in the background call, with output to a
file you can `tail`. To wait, give `Monitor` an until-loop on that output
(`until grep -q DONE out.log; do sleep 5; done`; `sleep` is fine inside it) and end the
background command with `echo DONE`.

- `node platform/marketing/regen.mjs --verify` and the pages test suites
  (over 10 min in a shallow clone)
- `node --test` over a whole venture (changepoint-detector alone: 280-400 s;
    Node 22 rejects `node --test .` with "Could not find '.'": run
    `cd ventures/<slug> && node --test '*.test.mjs'`)
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
  line contains the pattern (the `pgrep` form matches itself the same way).
  `.claude/hooks/block_pkill_f.py` refuses both, also inside heredocs that
  merely mention them; use `'[n]ame'` or `kill <pid>`.

## Outbound hosts

Egress goes through a proxy with a per-environment allow-list, so a host that
works in one session can 403 in the next (run records name irs.gov, ssa.gov,
the OPSD/ENTSO-E hosts and, on some days, huggingface.co). Before a plan
depends on a host, probe it once:
`curl -sS -o /dev/null -m 15 -w '%{http_code}\n' https://<host>/`. A 403 from
the proxy is not the site's answer. Then say in the PR, the run record or the
product's notes that a figure could not be checked against that source, rather
than skipping the step silently or citing from memory (`goals.md`: never
fabricate). If a research track's next step needs a host that 403s (e.g. OPSD data
for `energy-price-residual`), take another next step or a different data
source; workarounds usually cost the run more than they return. Proxy state and per-tool fixes: `curl -sS "$HTTPS_PROXY/__agentproxy/status"`.

## Scheduled tasks

A scheduled task created from a cloud session (`create_trigger`) may store
no repository source and no connectors. Its sessions can then lack the
GitHub MCP tools they need to land their PR. Read the tool's result, and tell
the owner if it warns about this.
