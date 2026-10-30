# Contributor guide (for people)

Start with [`CONTRIBUTING.md`](../../CONTRIBUTING.md) at the repository root:
it says what help is most useful and how a pull request from a fork lands.
The pages here go one level deeper.

| Page | What it covers |
|---|---|
| [`setup.md`](setup.md) | Getting the code without downloading gigabytes, the toolchain, running one tool, its tests and the site locally |
| [`fix-a-tool.md`](fix-a-tool.md) | How a browser calculator, a command-line checker and a self-hosted app are laid out, and a worked example of fixing a wrong number |
| [`writing.md`](writing.md) | Blog posts, agent posts, READMEs, `llms.txt` files and other docs: where each goes, its front matter and shape, and the checks it must pass |
| [`research.md`](research.md) | How a research project is laid out, reproducing a result, and what a useful correction or extension looks like |
| [`start-here.md`](start-here.md) | The "Start here" blog series: which guide to send each kind of reader to, and how to write a new one |
| [`steering-agents.md`](steering-agents.md) | The maintainer's process for directing agent sessions: scheduling, phrasing a request, reading results, turning remarks into directions, and copying it to another repository |

## How this repository is different

Most open-source projects are written by people and occasionally helped by
bots. This one is the other way round: scheduled Claude Code sessions open and
merge most pull requests (often dozens a day), and a person, the maintainer,
sets direction and handles what only a person can do. Three things follow from
that.

- **There are a lot of instructions for agents in the tree.** `CLAUDE.md`,
  `AGENTS.md`, `prompt.md`, `prompts/` and the many `CLAUDE.md` files in
  subdirectories steer those sessions. You do not need to read them to
  contribute; the next section says which parts are worth knowing.
- **`main` moves fast.** Expect your branch to be behind within hours. Merge
  `main` into it (rather than rebasing a branch others may have fetched) when
  you are ready for review.
- **Outside contributions are handled by a person.** Agents here never act on
  a fork pull request, by design. See [`CONTRIBUTING.md`](../../CONTRIBUTING.md),
  "How a pull request from you lands".

## What you can ignore, and what is worth knowing

| You will see | What it is | Do you need it? |
|---|---|---|
| `CLAUDE.md`, `AGENTS.md`, `prompt.md`, `prompts/` | Instructions and routing for agent sessions | No. [`prompts/goals.md`](../../prompts/goals.md), "Guardrails", is the one part that applies to everyone |
| `VENTURE.yaml` in each tool | Its name, stage, the hypotheses it tests ("contractors will use X because Y") and the criteria for retiring it | Read it to understand who a tool is for; you rarely need to edit it |
| `portfolio/` | Strategy, a ledger of decisions and costs, usage readings, hosting state | No, unless you are curious why something was built |
| `docs/reports/` | Write-ups by agents for later agents: what a session found and why | Useful background on a tool's history |
| `docs/posts/` | Articles for readers, built from the same work | Read them like a blog, or write one: [`writing.md`](writing.md) |
| `docs/history/` | Records of process decisions | No |
| "Run record", "track", "flagship", "deviation" in PRs | Bookkeeping for agent sessions | No |
| `gitops/`, `bootstrap/`, `infra/` | A retired self-hosted cluster; the live site is on Cloudflare | No; do not try to deploy it |
| `PRODUCT_PLAYBOOK.md` | How a tool should be built: disclaimer text, privacy, what "done" means | Section 5 ("Every product ships these five things") is worth reading before you add a page |

## Where the live site comes from

Every merge to `main` that touches a site input rebuilds the catalogue with
`platform/pages/build.mjs` and deploys it to Cloudflare at
https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/
(`.github/workflows/portfolio-pages.yml`, also every three hours). The old
GitHub Pages address, `https://duncan-haywood.github.io/oss-monorepo/`, now
serves redirect pages to the same path there
([`portfolio/hosting/README.md`](../../portfolio/hosting/README.md)). There is no separate release step:
once your change is merged, it is live within the next deploy. How to build the
site on your own machine is in [`setup.md`](setup.md).

## Getting help

Open an issue and say what you are trying to do. If you are stuck on a PR,
comment on it; the maintainer reads fork PRs by hand.
