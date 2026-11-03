# platform: the shared tooling behind the tools site

Everything here is shared by all of the products in [`ventures/`](../ventures/README.md):
the static-site generator that publishes them to
**[duncan-haywood.github.io/oss-monorepo](https://duncan-haywood.github.io/oss-monorepo/)**,
the CI guards that keep 1,000+ browser tools working, a privacy-respecting
visitor counter, and a few open-source tools that are useful on their own.
MIT licensed, like the rest of the repository.

## Open-source tools you can use in your own projects

| Directory | What it is |
|---|---|
| [`agents/`](agents/README.md) | **Command line and MCP server for AI agents** over every tool in `ventures/`: search, see a tool's functions and default inputs, and call its calculation engine with JSON, with no browser. Zero dependencies; 1,262 of 1,283 tools callable. |
| [`uitest/`](uitest/README.md) | **AI agent end-to-end UI testing for any web app.** Describe what a user is trying to do in plain language; an agent drives a real Chromium browser and passes or fails the run. CLI and GitHub Action, bring your own model key, deterministic checks run without one. |
| [`llm/`](llm/README.md) | **Bring-your-own-key LLM client** in one dependency-free file: OpenAI, Anthropic and other providers, or a local model (Ollama, LM Studio, llama.cpp) with no key. Works in a static page, Node, an edge function or a phone app. |
| [`counter/`](counter/README.md) | **Cookieless, first-party page-view counter** for a static site, about 200 lines of Node with no analytics vendor and no dependencies. |
| [`deploy/`](deploy/README.md) | **One-click self-deploy**: turns a product into a deploy-your-own-copy bundle (Docker, Fly.io, Render, OpenTofu) so anyone can run it in their own account. |
| [`business-template/`](business-template/README.md) | **AI-run business repository template.** Describe a business idea; get a repository that hourly Claude Code runs build and operate (product, marketing, sales, books, legal drafts, support), with one checklist for the steps only the owner may take. |
| [`proposal/`](proposal/README.md) | **Printable customer proposal** for the bid calculators: turns a finished quote into a one-page document to print or save as PDF, in the browser. |

## The tools site and its checks

| Directory | What it does |
|---|---|
| [`pages/`](pages/README.md) | Builds the public site: every browser tool in `ventures/` behind a searchable hub, category and audience pages, sitemaps, `llms.txt`, structured data, and the browser checks (journey, contrast, mobile layout). Also writes [`ventures/README.md`](../ventures/README.md) (`ventures-readme.mjs`). |
| [`webcheck/`](webcheck/check_pages.mjs) | Repo-wide sweep that fails on any product page a browser would not actually run (unclosed raw-text elements, broken inline scripts). |
| [`privacy/`](privacy/one-opt-out.mjs) | Guards for the local-only usage counters every product carries: they honour Do Not Track and Global Privacy Control, and each product has exactly one opt-out. |
| [`marketing/`](marketing/README.md) | Distribution that sits outside the tools site: the IndexNow submitter. |
| [`distribution/`](distribution/) | Packagers and announcers for registries and stores (npm, PyPI, Homebrew, VS Code, browser extensions, MCP, GitHub Actions, citation metadata). Each is off by default with a dry run; the rules are in [`portfolio/distribution/`](../portfolio/distribution/README.md). |
| [`devstats/`](devstats/README.md) | Public development dashboard at [`/dev/`](https://duncan-haywood.github.io/oss-monorepo/dev/): merges, lead time, CI pass/fail, agent run cost. |
| [`daily/`](daily/README.md) | Daily [engineering brief](https://duncan-haywood.github.io/oss-monorepo/dev/daily/) (~15 min) and [The Merge Report](https://duncan-haywood.github.io/oss-monorepo/dev/daily/show/) for the public, to read or listen to (browser speech). |
| [`devlog/`](devlog/README.md) | Development analyses at `/dev/analyses/`: what the agents building this portfolio tried, measured and tripped on. |

## CI and repository automation

| Directory | What it does |
|---|---|
| [`ci/`](ci/) | Python and Node guards run by the workflows in `.github/workflows/`: README titles and live links, CI-starvation classification, Pages state, stranded-branch detection, workflow validation, and the agent cross-review layer ([`ci/agent_review/`](ci/agent_review/README.md)). Each script's docstring says what it checks and why. |
| `skills/` | Placeholder for shared agent skills. |

[`VENTURE.template.yaml`](VENTURE.template.yaml) is the starting point for a new
product's manifest, and [`QUALITY_CONFIG.md`](QUALITY_CONFIG.md) the shared quality
settings. How to build a product end to end:
[`PRODUCT_PLAYBOOK.md`](../PRODUCT_PLAYBOOK.md).
