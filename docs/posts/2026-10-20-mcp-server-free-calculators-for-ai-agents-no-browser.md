---
title: "An MCP server for 1,262 free calculators: calling browser tools from an AI agent"
seo_title: "An MCP server for 1,262 free calculators"
date: 2026-10-20
description: "One zero-dependency Node file lets an AI agent search, describe and call 1,262 of this repo's free web tools as JSON, with no browser and no network."
tags: [mcp, ai-agents, command-line, open-source]
---

# An MCP server for 1,262 free calculators

This repository publishes about thirteen hundred free calculators and checkers
as web pages: a 401(k) loan versus withdrawal calculator, a 1099 vendor CSV
checker, roofing bid comparisons, an estimator for GitHub Actions minutes, and
so on. Most were built by unattended AI coding agents, with an owner steering
a few hours a week.

Many of these tools are more useful to an agent working for a person than to
the person. A bookkeeper's assistant checking a vendor export, or a coding
agent estimating what a workflow change will cost, needs the numbers, not a
form to click through. Until this week the only way for an agent to reach most
of them was to drive a browser.

[`platform/agents/tools.mjs`](../../platform/agents/tools.mjs), merged in
PR #8672 on 20 October 2026, removes that step. It is one Node file with no
dependencies. From a clone of the repository it searches the catalogue,
describes how to call a tool, and calls it, printing JSON. The same commands
run as a local [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server for Claude Code, Claude Desktop, Cursor, VS Code and other MCP
clients.

## The numbers

I counted these on `main` at commit `1ad1d16c` on 20 October, by running the
module's own `catalogue()` and `engines()` functions over every venture
directory, and `ls ventures/*/cli.mjs` for the last row.

| Measure | Value |
|---|---|
| Venture directories with a web page (`index.html`) | 1,283 |
| Callable without a browser | 1,262 |
| No engine module to call | 15 |
| Refused by the safety gate | 6 |
| Tools that also ship their own `cli.mjs` | 169 |

The README for [`platform/agents/`](../../platform/agents/README.md) gives the
same 1,262 / 15 / 6 split. The test file,
[`tools.test.mjs`](../../platform/agents/tools.test.mjs), ran 15 tests with 15
passes when I ran it. One of them imports every tool's engine and fails if one
stops loading outside a browser, for example because it touches `document` at
import time.

## How it works

Every tool page here does its arithmetic in plain ES modules sitting beside
the page: `calc.mjs`, `engine.mjs`, `check.mjs` and similar. The page's
`<script type="module">` imports them, reads the form, and calls an exported
function.

`tools.mjs` reads that same script tag to find which modules the page
computes with. It leaves out plumbing that is not part of the calculation
(`usage.mjs`, `share.mjs`, `byok.mjs`, `ai.mjs`). Then it imports those modules
in Node and calls their exported functions with JSON arguments.

There is no per-tool code. A tool is covered the day it lands, and the
numbers match the page's, because they are the page's own functions.

Most engines export a `DEFAULTS` object holding the page's default inputs.
`call --input` lays your object over `DEFAULTS`, which is what the page does
with its form, so you pass only what differs. Asking the 401(k) calculator
about a $20,000 need against a $60,000 balance returns the full argument list
it used (tax rates, growth, loan rate and term filled in from the defaults)
and a result with a maximum loan of $30,000 and a growth sensitivity table.
That is an example of the output shape, not advice: these tools give estimates
from the inputs you give, not legal, tax, financial or professional advice.

## Using it

You need Node 18 or later and a clone. There is no install step, and nothing
needs the network after the clone.

```sh
git clone --depth 1 https://github.com/duncan-haywood/oss-monorepo && cd oss-monorepo

node platform/agents/tools.mjs search 401k loan
node platform/agents/tools.mjs describe 401k-loan-vs-withdrawal-calculator
node platform/agents/tools.mjs call 401k-loan-vs-withdrawal-calculator analyze --input '{"need":20000,"balance":60000}'
node platform/agents/tools.mjs call 1099-vendor-csv-checker analyze --stdin < vendors.csv
node platform/agents/tools.mjs run actions-minutes-estimator -- --json .github/workflows
```

| Command | What it does |
|---|---|
| `search <words>` | Every word must match the slug, title or description; slug and title hits rank first. |
| `describe <slug>` | Each engine's exported functions with parameter lists and doc comments, its constants such as `DEFAULTS`, the live page URL, and the tool's own CLI if it has one. |
| `call <slug> <function>` | Calls one function. `--input` is an object over `DEFAULTS`, `--args` a JSON array, `--stdin` passes pasted text or CSV as the first argument. |
| `run <slug> -- <args>` | Runs the tool's own `cli.mjs`, for the 169 that have one. |
| `mcp` | A stdio MCP server with `search_tools`, `describe_tool`, `call_tool` and `run_cli`. |

The repository root has an [`.mcp.json`](../../.mcp.json), so Claude Code
offers the server when you open a clone. Other clients take the same block with
an absolute path to `tools.mjs` and the argument `mcp`.

The intended loop for an agent is: search in the user's words, describe the
best match to see its functions and defaults, then call it with only the
inputs that differ.

## The safety gate

An MCP server that imports and runs code on request needs a clear rule about
what it will load. This one has a static gate and a runtime limit.

**The static gate** runs before any import. A module loads only if:

- everything it imports, followed recursively, is a sibling file in the
  tool's own directory or a `node:` builtin, with no npm packages and nothing
  outside the directory;
- none of those files imports a network or process module. The blocked list
  is `http`, `https`, `http2`, `net`, `tls`, `dgram`, `dns`, `child_process`,
  `worker_threads`, `cluster`, `vm` and `inspector`;
- none of them contains `fetch(`, `WebSocket`, `eval(`, `new Function(` or
  `process.binding`.

This is the same import check the npm MCP bundle uses
([`platform/distribution/mcp.mjs`](../../platform/distribution/mcp.mjs)).
`describe` lists a refused module and the reason, so an agent knows to use
the web page instead.

The gate reads source text, so it is deliberately conservative. Of the six
tools it refuses, some do go online (a CORS checker, an SRI checker, a PWA
installability checker). Others are false positives. The env-example drift
checker contains a regular expression for Ruby's `ENV.fetch(`. The npm
lifecycle-script checker lists `"fetch("` and `"eval("` as strings to look
for in other people's packages. A false refusal costs one tool. A false pass
would let a calculator make network calls on an agent's behalf, so the
trade-off is reasonable.

**The runtime limit** applies in MCP mode. Each `call_tool` and `run_cli`
runs in a child Node process with a 20-second timeout and a 200 KB output cap,
so a runaway loop or a huge result cannot hang or flood the client.

Be clear about what this is not. It is not an operating-system sandbox. The
child process is ordinary Node, running code from your own clone. The gate
keeps calculator engines from reaching the network or spawning processes. It
does not make untrusted code safe. If you trust the clone, the gate keeps the
tools to arithmetic.

## Relation to the npm package

[`platform/distribution/mcp.mjs`](../../platform/distribution/mcp.mjs) builds
an npm package, `monorepo-projects-mcp`, that bundles the tools with a
`cli.mjs` for `npx` users. Publishing it is off until the owner enables it,
because publishing under the portfolio's name is an owner decision here.
`platform/agents/` needs no publishing: it works from any clone and covers
every tool with an engine module, not only the ones with a CLI.

## What is not known yet

Nobody outside the repository has used this yet as far as anything records.
The repository has no measured visitors on any product (see
[Counting visitors without tracking them](2026-10-20-count-website-visitors-without-tracking-privacy.md)).
Whether agents find tools by searching in a user's words is untested. If you
try it, an issue saying which tool you called and whether `describe` told you
enough would be the most useful thing to hear.
