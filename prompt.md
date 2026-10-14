# Repo prompt

The standing prompt that runs this repository going forward. Sessions launched
without a more specific brief should treat this as their task, alongside
[`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md) and
[`portfolio/DIRECTION.md`](portfolio/DIRECTION.md).

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](.github/prompts/land-your-work.md).

---

continue work on the repo aiming to develop, deploy, market,  sell and support revenue generating software products in production. use the resources you have available to you. merge when done. focus on providing valuable work no matter what not on admin restrictions and what not or other blockers. legally copying or taking inspiration from other existing valuable businesses is very valuable and offering the same service at less or in a better way or to a more speicfic niche market is a good approach. https://www.ycombinator.com/companies https://www.techstars.com/portfolio and others are good examples of potential companies. using advanced algorithms ai ml etc to provide value to consumers and businesses is a potentially good approach. ios android apps are another good approach. try to do things that are ambitious and deep enough that it is worth doing. focus on ventures that give the best roi for time invested in development marketing etc but also focus on starting new ones. if something doesn't have the possibility of generating revenue you can mark it for potential open sourcing or use it as a lead magnet and give it away for free. try to pursue ventures with real business potential and keep a portfolio site and also marketing sites for anything that is built out.

---

**Open source is the destination (added 2026-10-09).** Everything in this
repository is intended to be open sourced, ventures included — not only the
ones with no revenue path, which is all the "mark it for potential open
sourcing" line above covered. A venture can still be a viable for-profit
business and be open source: the code is free, and the business is the
hosting, support, convenience, niche expertise and brand around it. So build
as if the repository were going public tomorrow, and leave every venture you
touch closer to that:

- **No secrets in the tree.** Keys come from env vars; nothing sensitive in
  code, fixtures, test data or commit messages.
- **No private coupling.** A venture builds and runs from its own directory
  with documented steps — no hardcoded internal hostnames, personal paths, or
  dependence on this monorepo's private infra just to work.
- **A README a stranger can follow** — what it does, how to run it, how to
  set the optional API key, plus the LICENSE (MIT unless there's a reason)
  and the disclaimer (`PRODUCT_PLAYBOOK.md` §5).
- **No personal data** about the owner or anyone else; usage stats stay
  anonymous (`portfolio/usage/`).
- **Only code we can relicense.** "Legally copying or taking inspiration"
  above means ideas and public behaviour, never another product's code, copy
  or assets under an incompatible license.

**One repository is the end state; mirror it now (added 2026-10-13, changed
2026-10-14).** Everything ends up in this repository. The research portfolio,
`Duncan-Haywood/oss-research-monorepo`, lives here under `research/` with its
full commit history. Until the owner's cutover, the two repositories are
mirrored, with no history lost. Building and keeping that mirror is standing
work now, not something to wait for. The action list is the "Repository
merge" section of the research repository's
[`PROJECTS.md`](https://github.com/Duncan-Haywood/oss-research-monorepo/blob/main/PROJECTS.md),
which becomes `research/PROJECTS.md` here once the mirror lands. It holds the
sync script and the milestones. Take its first free milestone marked
*oss-monorepo*, and claim it with the milestone's name first in the PR title.

- **One writer at a time.** Until cutover, the research repository's `main`
  is the source, and `research/` here is a copy that a sync refreshes. Edit
  nothing under `research/` here, because the next sync overwrites it. Make
  the change in the research repository, then sync. After cutover,
  `research/` here is the source and the research repository is archived.
- **No history loss.** A sync is a merge commit whose second parent is the
  research repository's `main`. Its files land under `research/` by a fixed
  path map: `research/<slug>/` keeps its path, and every other top-level
  entry `E` goes to `research/E`. Every research commit keeps its original
  hash, and `git log -- research/<slug>` shows it. Never squash, rebase,
  cherry-pick or hand-copy research work in, and never rewrite either
  repository's history.
- **A mirror PR merges with a merge commit.** This is the one exception to
  squash-merging in
  [`land-your-work.md`](.github/prompts/land-your-work.md). The auto-merge in
  `platform/ci/agent_review` squashes, so it must not take a mirror PR. If
  GitHub refuses a merge commit, that is an owner setting: comment the
  blocker on the PR and stop. Never squash instead.
- **#6143 is retired, not landed.** Its copy dates from 2026-10-01. It came
  in through a one-off move commit, so later syncs cannot build on it. Redo
  the import from `main` with the sync. Split what else it has worth keeping
  into PRs of their own: the agent-review fork hardening, the Hetzner
  clean-up, and the Pages wiring for `/research/`. Then close it with a
  pointer. Every research commit in it is already in the research
  repository's `main`.
- **Leave room for it.** Do not create a top-level `research/` for anything
  else. Tree-wide checks here skip `research/` or run it under the research
  rules (`research/CLAUDE.md`), not the product rules.
- **Cutover is the owner's.** Three steps need the owner. This repository
  goes public first, because the research portfolio must stay public. The
  scheduled research runs then point here. Last, the research repository is
  archived, never deleted. Preparing everything else is every session's job.

Making a repository public is the owner's call (publishing under the
portfolio's name, `CLAUDE.md`). Preparing for it is every session's job.
