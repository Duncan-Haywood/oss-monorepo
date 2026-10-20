# Ventures track, prompt 0

The product sub-prompt. The master prompt (`prompt.md`) routes runs here. Work
alongside [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md) and
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md); the goals and
guardrails in [`prompts/goals.md`](../goals.md) bind every version of this
prompt.

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

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
  and the disclaimer ([`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md) §5).
- **No personal data** about the owner or anyone else; usage stats stay
  anonymous ([`portfolio/usage/`](../../portfolio/usage/README.md)).
- **Only code we can relicense.** "Legally copying or taking inspiration"
  above means ideas and public behaviour, never another product's code, copy
  or assets under an incompatible license.

**One repository, two peer portfolios (added 2026-10-13; cut over
2026-10-16).** Everything lands here. `ventures/` holds the products and
`research/` the open research portfolio, merged in from
`Duncan-Haywood/oss-research-monorepo` with its full history (`git log --
research/<slug>`); that repository is archived, read-only history. Neither
portfolio is a side project of the other. Inside `research/`, the research
rules (`research/CLAUDE.md`, the research track of `prompts/`) apply, not the
product rules. Do not create a top-level `research/` for anything else.

Making a repository public is the owner's call (publishing under the
portfolio's name, `CLAUDE.md`). Preparing for it is every session's job.
