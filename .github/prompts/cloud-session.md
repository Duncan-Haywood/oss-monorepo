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

## Long commands

A foreground command times out (2 min by default, 10 min at most), and
foreground `sleep` is blocked.
Start these with `run_in_background` and wait with `Monitor`:

- `node platform/marketing/regen.mjs --verify` and the pages test suites
  (over 10 min in a shallow clone)
- `python3 platform/ci/run_workflow_locally.py --for-changes` (over 5 min)
- `python3 portfolio/router/allocate.py` (35-120 s; its shallow-clone fetch
  can time out and leave counts partial)
- a full unshallow (above)

## Scheduled tasks

A scheduled task created from a cloud session (`create_trigger`) may store
no repository source and no connectors. Its sessions can then lack the
GitHub MCP tools they need to land their PR. Read the tool's result, and tell
the owner if it warns about this.
