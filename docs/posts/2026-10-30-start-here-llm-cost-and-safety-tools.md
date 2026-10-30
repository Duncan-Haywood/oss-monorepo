---
title: "Start here: free tools for LLM spend, output regressions and MCP server risk"
seo_title: "Free tools for LLM spend, output regressions and MCP server risk"
date: 2026-10-30
tags: [start-here, llm-cost, mcp, ai-agents]
description: "For developers shipping LLM features: eight free, local tools to price a workload, cap spend, catch output regressions and check MCP configs."
---

# Start here: free tools for LLM spend, output regressions and MCP server risk

This guide is for developers who have put a language model into something real. You might own a chatbot feature and the monthly bill. You might be about to swap models and worry that half your prompts will quietly break. Or you might connect MCP servers to an agent and wonder what you just gave them access to.

The repository has eight small, free tools for those three worries. Each runs in your browser with nothing uploaded, and most also run from the command line for CI. None needs an account or an API key.

If you want to call the repository's tools from your own agent, as an MCP server or from the command line, that is a different guide: [Start here: tools for your AI agent](2026-10-29-start-here-ai-agents-and-mcp.md).

## The problem, in your words

"The bill doubled and I don't know which feature did it." "We compared providers on the blended per-token price and forgot cached tokens exist." "An agent got stuck in a loop overnight." "We switched models and the JSON stopped parsing for some inputs, and nobody noticed for a week." "Someone added an MCP server with a token pasted straight into the config."

## What you get

**Before you spend: estimate and scan**

- **[LLM API Pricing Calculator](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/llm-api-pricing-calculator/).** Enter a month's fresh input, cached input and output tokens once, and price them across up to four providers, cheapest first. It shows the cached share and what caching saved. It does not fetch any vendor's prices. The pre-filled rates are labelled as examples, and you type in current ones.
- **[LLM Call Cost Scan](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/llm-call-cost-scan/).** Paste code, or point the CLI at a folder of `.js`, `.ts` or `.py` files. It flags OpenAI, Anthropic and Gemini calls with no output cap, calls inside a loop, hard-coded premium models, model names on its short retired list, and models it cannot price because they come from a variable. Add your own calls per day and token guesses for a monthly figure.

**While you spend: read the log and cap it**

- **[LLM Usage Log Analyzer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/llm-usage-log-analyzer/).** Paste the per-request usage log your app already writes (JSONL, JSON or CSV, in Anthropic or OpenAI field names). You get spend by model, feature label and day, the real cache-read share, a 30-day run rate, and three what-ifs: more caching, a batch tier, or moving traffic to another model. The README calls the savings upper bounds, not forecasts.
- **[LLM Spend Guard](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/llm-spend-guard/).** A self-hosted proxy, or a zero-dependency library, that refuses a call before it is sent when it would break a budget. Budgets can be per user, feature, API key or agent run. Each call reserves its worst case first, so twenty parallel calls cannot all spend the same remaining dollar. Breakers trip on repeated identical requests or a burst rate. A model with no configured price is refused. It has an `observe` mode that refuses nothing and reports what it would have refused, and a `simulate` command that replays last month's log through a policy. The README puts it at about 800 lines across three files.

**When you change a model or prompt: diff the outputs**

- **[LLM Output Regression Diff](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/llm-output-regression-diff/).** Save outputs from before and after as JSONL with an `id` and an `output` per case. It lists, per case, invalid JSON, lost keys, changed types, new refusals, truncation, lost numbers, lost structure and big length or wording changes. The CLI exits 1 when regressions pass your limit, so it can gate CI.

**When you connect MCP servers: check the config and watch for drift**

- **[MCP Config Risk Check](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/mcp-config-risk-check/).** Paste an `mcp.json`, `claude_desktop_config.json` or `.vscode/mcp.json`. It flags shell or root-path access, secrets written into the config instead of referenced from an environment variable, `npx`, `uvx`, `pipx` or `docker` launches with no version pin, and tool names shadowed across servers.
- **[MCP Supply-Chain Watch](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/mcp-supply-chain-watch/).** Compare two captured tool manifests from the same server, from the day you approved it and from today. It reports tools added, removed or changed, and flags new descriptions with wording aimed at the calling model, the pattern behind tool-poisoning attacks. The config check looks at one launch file now; this one looks at change over time. Each tool's footer links to the other.

**And one for your docs**

- **[llms.txt Generator](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/llms-txt-generator/).** Builds an `llms.txt` file, a short curated map of your site for AI assistants, from a page list, a sitemap or a local Markdown folder, and validates one you already have. It cannot promise any assistant will read the file.

## Your first ten minutes

1. **Open [LLM Call Cost Scan](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/llm-call-cost-scan/)** and paste the file where your app calls a model. Fix any missing `max_tokens` first. It is the cheapest guard there is.
2. **From a clone, run the scan in a terminal** (Node 18 or later, nothing to install):

   ```bash
   node ventures/llm-call-cost-scan/cli.mjs scan src
   node ventures/llm-call-cost-scan/cli.mjs scan src --fail-on warn   # as a CI gate
   ```

   On a three-line Python test file with an Anthropic call inside a `for` loop and no cap, it reported two warnings, `no-output-cap` and `call-in-loop`.
3. **Write a spend policy and read it back:**

   ```bash
   node ventures/llm-spend-guard/cli.mjs init guard-policy.json
   node ventures/llm-spend-guard/cli.mjs check-policy guard-policy.json
   ```

   The example policy uses `example-*` model names and placeholder prices. Put in your own models and your provider's current rates. Then run `simulate` against a real log before you ever put the proxy in front of traffic.
4. **Try the regression diff** on two small JSONL files:

   ```bash
   node ventures/llm-output-regression-diff/cli.mjs diff baseline.jsonl candidate.jsonl
   ```

   In a two-case test, a number turned into a string and an answer turned into "I cannot help with that." It caught both, with `json-type-changed` and `new-refusal`, and exited 1.
5. **See what tool drift looks like** with the bundled example:

   ```bash
   python3 ventures/mcp-supply-chain-watch/src/mcp_watch.py \
     ventures/mcp-supply-chain-watch/examples/before.json \
     ventures/mcp-supply-chain-watch/examples/after.json --format markdown
   ```

   It reports one ALERT, a description that now contains model-directed language, and one REVIEW, a newly added `delete_inventory` tool.

## How to get involved

The most useful things you can send are real-world misses. Maybe the cost scan missed an LLM call your code makes; it does not match wrapper libraries such as LangChain or LiteLLM in this version. Maybe the regression diff flagged an improvement as a break, or the config check missed a risky pattern you have seen. Send the shape of the problem without your secrets or private prompts, as a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). A rule or a log format you want supported goes in a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml). Nobody promises it gets built.

Pull requests from forks are reviewed by the maintainer by hand. The repository's agents never act on them.

## Cost and data

All eight tools are free and MIT licensed. The browser pages run locally and do not upload what you paste. Several keep a couple of anonymous feature counts in your browser's local storage, which you can switch off on the page. The spend guard's proxy runs on your machine and talks only to the provider APIs, plus a webhook if you set one. Its state file holds counters, not prompts, responses or keys. With no upstream key set, each caller's own key passes through and is never stored.

## What it does not do

- **Prices are yours to supply.** Every cost figure is your token counts times rates you typed in or edited. None of it is a bill.
- **The scans are pattern checks.** The cost scan reads code text, not traffic. The MCP checks read the config or manifests you give them. They never contact a server, a registry or a vulnerability database. A clean result is not a safety guarantee.
- **The regression diff is a tripwire, not a judge.** It cannot tell whether an output is correct or better, so keep your own evaluation for quality.
- **The spend guard is not a billing system.** Keep your provider's own spend limits on as well.
- **No proof of uptake yet.** In each tool's `VENTURE.yaml`, the hypotheses about who will use it and how are marked untested. Hosting is best effort.
- None of this is financial, security or engineering advice, and none of it is affiliated with any model provider or MCP vendor.

## Where to go next

- Each tool's source, tests and limits: `ventures/<slug>/README.md` and `ventures/<slug>/llms.txt`
- The spend guard's plans: `ventures/llm-spend-guard/ROADMAP.md`
- Calling these tools from an agent or as an MCP server: [Start here: tools for your AI agent](2026-10-29-start-here-ai-agents-and-mcp.md)
- What this repository's own agent runs cost, measured: [Start here: how the agent fleet is measured](2026-10-30-start-here-how-the-agent-fleet-is-measured.md)
- Running these yourself or on your own site: [Start here: run your own copy](2026-10-29-start-here-self-hosting.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
