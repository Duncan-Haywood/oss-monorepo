# Ventures track, prompt 1

The product sub-prompt. The master prompt (`prompt.md`) routes runs here. Work
alongside [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md) and
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md); the goals and
guardrails in [`prompts/goals.md`](../goals.md) bind every version of this
prompt.

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

A new or changed venture also runs `node platform/pages/venture-preflight.mjs <slug>`
before the merge: the site-wide checks its own tests cannot see. It takes over 5 min,
longer than the 120s foreground timeout, so start it with `run_in_background`.

---

continue work on the repo aiming to develop, deploy, market,  sell and support revenue generating software products in production. use the resources you have available to you. merge when done. focus on providing valuable work no matter what not on admin restrictions and what not or other blockers. legally copying or taking inspiration from other existing valuable businesses is very valuable and offering the same service at less or in a better way or to a more speicfic niche market is a good approach. https://www.ycombinator.com/companies https://www.techstars.com/portfolio and others are good examples of potential companies. using advanced algorithms ai ml etc to provide value to consumers and businesses is a potentially good approach. ios android apps are another good approach. try to do things that are ambitious and deep enough that it is worth doing. focus on ventures that give the best roi for time invested in development marketing etc but also focus on starting new ones. if something doesn't have the possibility of generating revenue you can mark it for potential open sourcing or use it as a lead magnet and give it away for free. try to pursue ventures with real business potential and keep a portfolio site and also marketing sites for anything that is built out.

---

**Read the brief above literally (added 2026-10-15, owner-directed).** The
paragraph between the rules is the owner's own brief. It asks for ambitious,
deep products of the kind on the YC and Techstars lists, AI and ML where they
add value, iOS and Android apps, and real business potential. Measured on
2026-10-15, the fleet had built 1,236 ventures instead: 641 are named
`*-calculator` (121 `*-bid-calculator`), there is no native mobile app, and
no venture has a single measured visitor. That is not the brief. So:

- **No new calculator work** (owner, 2026-10-21, walking back the 2026-10-16
  "principle, not a ban"): the owner wants no new calculators and no new
  features, pages or consolidation for the 650+ that exist. Fix one when
  it is broken. This is about where a run's effort goes, not what may land:
  already-built calculator work (an open PR, a stranded branch) is fine to
  merge. Higher-value products are the work (`prompts/goals.md`,
  "Direction: depth over calculators").
- **A new venture should say why someone would use it.** Name the free or paid
  alternatives a user has today and what this does better, in the venture's
  README. If you can't, it is probably not worth building.
- **Build something with depth:** a real workflow, data, an algorithm, an
  integration, AI/ML that clearly helps, or a mobile or desktop app. Land a
  first working version in one run and deepen it over later runs.
- **Finish ventures as one-click, self-deployed businesses.** The owner,
  2026-10-15: "the model I'm thinking is fully developing one click deploy actual businesses with a web page with some inputs for credentials so people can spin up their own copies of the venture. then I'm not hosting and not liable. it's someone else. but still with a donate to the creator button."
  A venture is done when a stranger can open its page, enter their own
  credentials, click Deploy, and end up running their own copy in their
  own accounts, with the "donate to the creator" link still in it. Credentials
  go straight to the deployer's cloud or fork and never pass through anything
  the owner runs (`prompts/goals.md`, Mission). Taking an existing venture
  all the way there counts as much as anything new.
- **Deepen a flagship by default** (owner, 2026-10-20, quoted in
  `prompts/goals.md`). Unless your brief names other work, take the top
  "Deepen (flagship N)" row of `python3 portfolio/router/allocate.py` and
  land a working slice of its milestone: a hard business or engineering
  problem, not polish. When you land it, rewrite that venture's `next:` in
  [`portfolio/flagships.yaml`](../../portfolio/flagships.yaml) to the next
  milestone. Probe hosts before planning around them: from a cloud session
  raw.githubusercontent.com and pypi.org usually answer, while directory
  listings on api.github.com, huggingface.co and hcb.hackclub.com often do not.
  If every item needs a blocked host, land an item that needs no outside data,
  or take the next flagship, rather than ending empty.  The small tools stay; fix them when they break, but they are
  not where runs go.
- **Payments.** A product may include payment code, off by default and
  running only on the deployer's own keys from environment variables. The
  owner's own instances may link to the owner's merchant-of-record checkout;
  no merchant key ever (`prompts/goals.md`, "Payments: the owner's merchant of record, never a key").
  Publishing to an app store stays an owner step. Building the app does not.
- Where `DIRECTION.md`, `PRODUCT_PLAYBOOK.md`, `CLAUDE.md` or
  `session_gate.py` push toward another cheap static page, this section wins.
  Use judgment (`prompts/goals.md`, "Judgment over rules").

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
product rules. Avoid creating a top-level `research/` for anything else.

Making a repository public is the owner's call (publishing under the
portfolio's name, `CLAUDE.md`). Preparing for it is every session's job.
