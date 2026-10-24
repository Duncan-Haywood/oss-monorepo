# Command line and MCP server for AI agents

Call any of the ~1,300 free calculators and checkers in [`ventures/`](../../ventures)
from a terminal, a script, or an AI agent, with no browser. Search for a tool,
see how to call it, and get its result as JSON. The same commands also run as a
local [MCP](https://modelcontextprotocol.io) server for Claude Code, Claude
Desktop, Cursor, VS Code and other MCP clients.

The tools are published as web pages at
**https://duncan-haywood.github.io/oss-monorepo/**. Many of them are more
useful to an agent working for a person than to the person: a contractor's
assistant pricing three bids, a bookkeeper's agent checking a 1099 vendor CSV,
or a coding agent estimating the CI minutes a workflow change will burn. An
agent needs the numbers, not a form to click through.

```sh
git clone --depth 1 https://github.com/duncan-haywood/oss-monorepo && cd oss-monorepo

node platform/agents/tools.mjs search 401k loan
node platform/agents/tools.mjs describe 401k-loan-vs-withdrawal-calculator
node platform/agents/tools.mjs call 401k-loan-vs-withdrawal-calculator analyze --input '{"need":20000,"balance":60000}'
node platform/agents/tools.mjs call 1099-vendor-csv-checker analyze --stdin < vendors.csv
node platform/agents/tools.mjs run actions-minutes-estimator -- --json .github/workflows
```

You only need Node 18 or later. It has no dependencies and no install step, and
it needs no network after the clone.

## Commands

| Command | Prints |
| --- | --- |
| `search <words...> [--limit N]` | JSON `{ total, tools: [{ slug, title, description, url }] }`. Every word must match. |
| `describe <slug>` | JSON: each engine module's exported functions with their parameter lists and doc comments, its constants (`DEFAULTS` holds the page's default inputs, plus any sample inputs), the live page URL and source, the tool's own CLI if it has one, and `papers`: the full citation of each method a [research-algorithm tool](../../portfolio/research-tools/README.md) implements. |
| `call <slug> <function> [--input JSON] [--args JSON] [--stdin] [--module FILE]` | JSON `{ module, function, args, result }`. `--input` is one object laid over the module's `DEFAULTS`, which is what the page does with its form, so you pass only what differs. `--args` is a JSON array of positional arguments. `--stdin` passes pasted text or CSV as the first argument. |
| `run <slug> -- <args>` | Runs the tool's own `cli.mjs`, for the ~170 tools that have one. |
| `mcp` | A stdio MCP server with `search_tools`, `describe_tool`, `call_tool` and `run_cli`. |

Add `--compact` for single-line JSON.

## As an MCP server

The repository root has an [`.mcp.json`](../../.mcp.json), so Claude Code
offers the server when you open a clone. Other clients take the same block, with
an absolute path:

```json
{ "mcpServers": { "monorepo-projects-tools": { "command": "node", "args": ["/path/to/oss-monorepo/platform/agents/tools.mjs", "mcp"] } } }
```

Each `call_tool` and `run_cli` runs in a child process with a 20-second timeout
and a 200 KB output cap.

## How it works, and what it will not load

Each tool's page computes with plain ES modules that sit beside it
(`calc.mjs`, `engine.mjs`, `proposal.mjs`, ...). `tools.mjs` reads which ones
the page's `<script type="module">` imports, leaving out usage-counter and
share-link plumbing, and imports those same modules. It has no per-tool code, so
a tool is covered the day it lands, and the numbers match the page's exactly.

A module loads only if everything it imports is a sibling file or a `node:`
builtin, none of it imports a network or process module, and none of it calls
`fetch`, `WebSocket` or `eval`. This is the same gate the npm MCP bundle uses
([`platform/distribution/mcp.mjs`](../distribution/mcp.mjs)). The handful of
tools that look something up online, such as DNS and header checkers, are
listed by `describe` with the reason they are skipped. Use their pages instead.

As of 2026-10-20, 1,262 of 1,283 tools are callable this way. 15 have no
engine module, and 6 are skipped by the gate.
`tools.test.mjs` imports every tool's engine and fails if one stops loading
outside a browser, for example because it touches `document` at import time.

## Relation to the npm MCP package

[`platform/distribution/mcp.mjs`](../distribution/mcp.mjs) builds
`monorepo-projects-mcp`, an npm package that bundles the ~170 tools with a
`cli.mjs` for `npx` users. It is off until the owner enables publishing. This
directory needs no publishing: it works from any clone and covers every tool
with an engine.

Results are estimates from the inputs you give, not legal, tax, financial or
professional advice. Each tool's page states its own limits. MIT licensed.
