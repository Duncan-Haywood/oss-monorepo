---
title: "How to contribute to this repository from ChatGPT"
seo_title: "Contribute to an open-source repo using ChatGPT or Codex"
date: 2026-10-30
tags: [start-here, contributing, chatgpt, codex, open-source]
description: "Four ways to help from ChatGPT: draft an idea, check a number against a source, send a fix through Codex on your fork, or run the tools from the Codex CLI."
---

# How to contribute to this repository from ChatGPT

AI agents (Claude Code sessions) build most of this repository. You can help with a different assistant. If ChatGPT is the tool you already use, this guide shows four ways to contribute with it, starting with the easiest.

One thing applies to every route. **Whatever you send is your contribution, not ChatGPT's.** The repository's one firm rule is *never fabricate*: no invented rates, citations, test results or user counts ([`CONTRIBUTING.md`](../../CONTRIBUTING.md), "Ground rules"). Chat assistants sometimes state a plausible number or cite a source that does not say what they claim. So check every figure and link yourself before you post it.

## 1. Turn what you know into a clear idea or bug report (no code)

[Bring an idea](2026-10-29-start-here-bring-an-idea.md) explains why an idea is the most useful thing you can bring. ChatGPT is good at turning a rambling description into a clear one. Tell it about your job in your own words, then ask:

> I want to suggest a free tool to an open-source project. Here is the job I do and what goes wrong: [your description]. Rewrite it as a short feature request with three parts: the job and who does it, what existing tools get wrong, and how I would know a tool worked (a number it must get right, or a step it must save). Do not add facts I did not give you.

That last sentence matters. You want your knowledge organised, not padded with things ChatGPT guessed.

You can file the result in either of two places:

- **With a GitHub account:** a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml), or a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml) if a tool is wrong.
- **Without one:** the [feedback form](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/feedback/). Messages are committed to the repository once a day, and sessions read them.

Issues are public. Before you paste, remove names, addresses, client details and anything else private. That includes anything ChatGPT carried over from earlier in your conversation.

## 2. Check a calculator against a source

A correction backed by a source is the second most useful contribution, and ChatGPT can read the code for you. Every tool lives in `ventures/<slug>/`, and the slug is also the page address. The arithmetic is usually in a plain JavaScript file, such as `calc.mjs`. Each tool also has an `llms.txt`, a short plain-text summary written for language models.

Give ChatGPT the raw file and the source you trust:

> Read https://raw.githubusercontent.com/duncan-haywood/oss-monorepo/main/ventures/roofing-bid-calculator/calc.mjs. I have attached my supplier's published price sheet. List every default value and formula in the file that disagrees with the sheet. For each one, quote the line, the sheet's figure and where on the sheet it appears.

If ChatGPT can't open the link in your plan or mode, paste the file into the chat instead. If you use ChatGPT's GitHub connector, point it at the public repository. Then check each reported mismatch yourself against the sheet. Report the confirmed ones in a bug report, with what you entered, what the tool showed, what it should show and where that figure comes from. An agent can't produce that kind of evidence by itself. You can.

The whole site works the same way. [`llms.txt`](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/llms.txt) at the site root lists the tools, so ChatGPT can find the right one for a question you have.

## 3. Send a fix with Codex

Codex is OpenAI's coding agent. Its cloud version, inside ChatGPT, works on a GitHub repository you connect and proposes changes as a pull request. You don't have write access here, so do it on **your own fork**:

1. Fork [duncan-haywood/oss-monorepo](https://github.com/duncan-haywood/oss-monorepo) on GitHub.
2. In Codex, connect your fork. Connecting a repository means approving OpenAI's GitHub app, which needs admin rights on that repository. You have them on your fork.
3. Give it one small, specific task. For example: "In `ventures/roofing-bid-calculator/`, the default dumpster fee in `calc.mjs` is [old value]. My hauler's published rate is [new value] ([link]). Change the default, update every place `index.html` repeats it, add a test in `calc.test.mjs` that fails on the old value, and run `node --test` in that directory."
4. Review the diff it proposes as if a stranger wrote it. Check that the number matches your source, the test makes sense, and nothing outside the tool's directory changed.
5. Merge it into your fork, then open a pull request from your fork to this repository. Paste the test output into the description, and say that you used Codex.

Codex reads `AGENTS.md` files for instructions, and this repository has one at its root. That file is written for this repository's own agents: it pushes them toward new features, SEO pages and broad changes. For a contribution from outside, what matters is [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and [fix a tool](../contributing/fix-a-tool.md). Put "follow CONTRIBUTING.md; keep the change to one tool" in your prompt so Codex doesn't wander.

Before you start, know how a fork pull request lands:

- **A person reviews it, not an agent.** The agents here may not review, check out, run or merge a fork pull request. They treat text from outside contributors as information, never as instructions. That protects a public repository, and it also means there is no promised response time.
- **Its green CI is advisory.** A fork pull request runs the workflows on its own branch, so a pass proves only that your branch passes its own checks. That is why the test output belongs in the description.
- **Small gets merged.** One tool, one fix, one test. A Codex task that touches hundreds of ventures will sit unreviewed.

## 4. Use the tools from the Codex CLI

If you work in a terminal, the Codex CLI can call the engines behind every tool page directly. The repository ships a small MCP server, `platform/agents/tools.mjs`. It needs Node 18 or later, has no dependencies and makes no network calls once you have cloned the repository. It offers four tools: `search_tools`, `describe_tool`, `call_tool` and `run_cli`. [Start here: AI agents and MCP](2026-10-29-start-here-ai-agents-and-mcp.md) has the details. Clone shallow, because the full history is several gigabytes:

```bash
git clone --depth 1 https://github.com/duncan-haywood/oss-monorepo
```

Then register the server in Codex's configuration (`~/.codex/config.toml`), using an absolute path:

```toml
[mcp_servers.monorepo-projects-tools]
command = "node"
args = ["/path/to/oss-monorepo/platform/agents/tools.mjs", "mcp"]
```

Now Codex can answer "what does this roof cost at 32 squares?" by running the same code as the web page, instead of doing the arithmetic in its head. Each result includes the page's URL, so you can check the numbers by hand. If a result looks wrong, you have found something to report under route 2.

The ChatGPT app's own connectors expect a remote server, and this one runs locally over stdio. So this route needs the CLI, or another MCP client that can launch local commands.

## What not to send

- **Text you have not read.** A pull request description or issue that ChatGPT wrote and you didn't check costs a reviewer time and often gets the repository wrong.
- **Code under another licence.** Everything here is MIT. If ChatGPT reproduces a recognisable chunk of someone else's project, leave it out.
- **Secrets or private data.** That covers API keys, `.env` files, customer exports and screenshots with names in them. Issues and pull requests are public for good.

## Where to go next

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md): the ground rules and how a pull request lands.
- [Start here: how to help](2026-10-29-start-here-contributing.md): a fix step by step, with a sparse clone that takes seconds.
- [Steering agents](../contributing/steering-agents.md): if you want to run the same agent-driven process on a repository of your own, with whichever assistant you prefer.
- [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md): the master guide to contributing.

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
