---
title: "Start here: give your AI agent 1,300 free calculators and checkers"
date: 2026-10-29
tags: [start-here, mcp, ai-agents, developer-tools]
description: "For developers and Claude Code or Cursor users: call any tool's engine from the shell or a local MCP server, plus a BYOK model client and an agent UI tester."
---

# Start here: give your AI agent 1,300 free calculators and checkers

This guide is for developers, and for anyone who works through an AI assistant such as Claude Code, Cursor, Claude Desktop or VS Code with an MCP client. If you have ever watched a model do arithmetic in its head for a roofing quote, a loan comparison or a CSV check and wondered whether to trust it, this is for you.

The repository holds about 1,300 free tools, each a web page at [the live site](https://duncan-haywood.github.io/oss-monorepo/). Behind almost every page is a small JavaScript engine that does the actual calculation. One script lets your terminal, your scripts or your agent call those engines directly, with JSON in and JSON out, and no browser.

## The problem, in your words

"My agent needs a number it can defend, not a plausible guess." "I want it to price three bids, or check a vendor CSV, and show its working." "I do not want to wire up a dozen APIs, sign up for keys, or send my client's data to someone else's server."

## What you get

- **Deterministic answers.** The agent calls the same code the web page runs, so its numbers match the page exactly, and each result comes with the page's URL so a person can check it by hand.
- **No install, no keys, no network.** It needs Node 18 or later and a clone. The runner has no dependencies, and it needs no network after the clone.
- **Every tool covered automatically.** The runner reads which modules each page imports and loads those. There is no per-tool wrapper, so a new tool is callable the day it lands.
- **A safety gate.** A module is loaded only if it imports nothing but sibling files and Node built-ins, and never calls `fetch`, `WebSocket` or `eval`. The handful of tools that need the network, such as DNS and header checkers, are skipped and `describe` says why.

## Your first ten minutes

1. **Clone shallow.** The full history is several gigabytes; you do not need it.

   ```bash
   git clone --depth 1 https://github.com/duncan-haywood/oss-monorepo && cd oss-monorepo
   ```

2. **Search.** Every word must match.

   ```bash
   node platform/agents/tools.mjs search changepoint
   ```

   Run while writing this guide, that printed:

   ```json
   {
     "total": 1,
     "tools": [
       {
         "slug": "changepoint-detector",
         "title": "Changepoint Detector — find when a time series changed (PELT + Bayesian)",
         "description": "Free changepoint detection for any time series. ...",
         "url": ".../changepoint-detector/"
       }
     ]
   }
   ```

   An empty search on the same day reported 1,305 tools in the index.

3. **Describe.** This lists each engine module's functions with their parameters and doc comments, the default inputs the page uses, the live page and source, the tool's own CLI if it has one, and, for tools built from research papers, the full citations.

   ```bash
   node platform/agents/tools.mjs describe changepoint-detector
   ```

4. **Call.** `--input` is one object laid over the page's defaults, so you pass only what differs.

   ```bash
   node platform/agents/tools.mjs call changepoint-detector analyze \
     --input '{"values":[10,11,9,10,12,10,11,20,21,19,20,22,20,21]}'
   ```

   The result includes the segments, each change with its range, and a summary sentence: "From 8 (after 7) the mean moves up from 10.43 to 20.43, 9.54 noise standard deviations; the Bayesian method puts 98% probability on a change within 3 points of it."

   A money example from the README works the same way:

   ```bash
   node platform/agents/tools.mjs call 401k-loan-vs-withdrawal-calculator analyze \
     --input '{"need":20000,"balance":60000}'
   ```

   The output echoes every assumption it used (tax rates, growth, loan terms), so the agent can tell the person which ones to change.

5. **Pipe a file in.** `--stdin` passes pasted text or a CSV as the first argument, for checkers such as `node platform/agents/tools.mjs call 1099-vendor-csv-checker analyze --stdin < vendors.csv`. Tools with their own command-line program (about 170 of them) run with `run <slug> -- <args>`.

Add `--compact` to any command for single-line JSON.

## As an MCP server

The same script speaks MCP over stdio with four tools: `search_tools`, `describe_tool`, `call_tool` and `run_cli`. The repository root has a `.mcp.json`, so Claude Code offers the server when you open the clone. For other clients, use the same block with an absolute path:

```json
{ "mcpServers": { "monorepo-projects-tools": { "command": "node", "args": ["/path/to/oss-monorepo/platform/agents/tools.mjs", "mcp"] } } }
```

The server tells the client to search, then describe, then call. Each call runs in a child process with a 20-second timeout and a 200 KB output cap. When this guide was written, an `initialize` followed by `tools/list` over stdio returned exactly those four tools.

## Bring your own model: `platform/llm`

If you are building something that should use a model only when the person running it wants one, `platform/llm/byok.mjs` is the client the tools here share. It is one file with no dependencies, using plain `fetch`, so it works in a static page, a Node server, an edge function or a phone app.

- **Providers:** Anthropic, OpenAI, Google Gemini, anything that speaks `/chat/completions` (OpenRouter, Groq, Together, Mistral), and three local servers with no key at all: Ollama, LM Studio and llama.cpp's `llama-server`.
- **The key belongs to the person running it.** In a page it stays in the visitor's own browser storage; on a server it comes from the deployer's environment. Error messages never echo a provider's response body.
- **A working path without AI.** `withFallback` runs your deterministic code when no key is set or the call fails, and reports which path ran, so your page can say that AI is off instead of quietly getting worse.
- **Local discovery.** `detectLocal()` looks for a model server on the machine; `isLocal(cfg)` tells you when you can honestly say "stays on your computer". The README covers the CORS and browser-permission settings that decide whether a public web page can reach `localhost`.
- **Spend caps.** Pass an LLM Spend Guard to `complete` and a call that would cross a budget is refused before it is sent.

Its 20 tests run with no network: `node --test platform/llm/*.test.mjs`.

## Test your own web app with an agent: `uitest`

`platform/uitest` tests a web app the way a user does. You describe a goal in plain language ("add two items to the cart and check out as a guest") and what should be true at the end; an agent drives a real Chromium through Playwright and passes or fails with a quote of what it saw. The checks that must be exact stay deterministic and need no key: a smoke pass over the page, JavaScript errors, failed requests and scripted steps. A goal can only fail a run, never rescue one.

```bash
npm i -D playwright && npx playwright install chromium
node platform/uitest/uitest.mjs --serve dist --crawl 20      # no key: smoke-test a build
node platform/uitest/uitest.mjs --url http://localhost:3000 \
  --goal "Add two items to the cart and check out as a guest" \
  --expect "An order confirmation number is shown"
```

It ships as a GitHub Action too (`Duncan-Haywood/oss-monorepo/platform/uitest@main`), writes JUnit XML, a Markdown summary, JSON and failure screenshots, and works with your own model key.

## Cost and where data goes

All of it is free and MIT licensed. The tool runner works offline and sends nothing anywhere. The model client sends prompts only to the provider you configure, with your key, or to a model on your own machine. `uitest` sends a text snapshot of each page to the model you choose; the README estimates a few thousand input tokens per step and reports the calls and tokens each run used.

## What it does not do

- **Results are estimates from the inputs given**, not legal, tax, financial or professional advice. Each tool's page states its own limits; an agent should pass them on.
- **Not every tool loads.** As of the README's count on 2026-10-20, 1,262 of 1,283 tools were callable; 15 had no engine module and 6 were skipped by the network gate.
- **No hosted API.** You run it from a clone. An npm package bundling the tools that have a CLI exists in the tree but is not published.
- **uitest has limits.** One tab, Chromium only, no file upload, drag and drop or canvas interaction, and no visual-regression diffing. Agents vary between runs, so keep anything that must be exact as scripted steps, and run goals against a test environment, not production with real payment details.

## Where to go next

- The runner and MCP server: `platform/agents/README.md`
- The model client: `platform/llm/README.md`
- The UI tester: `platform/uitest/README.md`
- One engine in depth: [the Changepoint Detector guide](2026-10-29-start-here-changepoint-detector.md)
- Running a whole app yourself: [Start here: self-hosting](2026-10-29-start-here-self-hosting.md)
- Helping out: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
