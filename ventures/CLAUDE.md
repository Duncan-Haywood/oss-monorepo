# Working in `ventures/`

Venture-only rules, moved out of the root `CLAUDE.md` so research and review runs
don't load them. The root file's public-repository, landing and CI rules still apply.

## Product-first default

**Updated 2026-11-24.** Every session should move a paid product closer to a
paying customer, with usage tracked and disclaimers in place: the ranked bets
in [`portfolio/monetization/bets.md`](../portfolio/monetization/bets.md),
vertical software for small and medium businesses chosen by promise, not by
how much code already exists (`../prompts/goals.md`, "North star" and "Where
effort goes"). Features, fixes, landing pages, SEO, integrations and running
apps beat ledger entries and analysis documents. (Before 2026-11-24 this said
"something strangers can use for free"; free is now for front doors to a bet.)

**Self-deploy principle (owner, 2026-10-15).** The aim is not for us to host
these apps. Each one is an MIT open-source business that anyone can one-click
host in their own cloud: credentials go in, they click Deploy, OpenTofu does
the rest, and nothing of ours runs in between. This is the business model
(`../prompts/goals.md`, Mission) and the finish line for a venture
(`../prompts/ventures/prompt-1.md`). Details, including how OpenTofu is set up and the Buy Me a
Coffee exception: `../PRODUCT_PLAYBOOK.md` §2, "Rule of thumb: anyone can
deploy it themselves".
**Updated 2026-11-24: hosted by default, self-deploy only on request.**
Products are hosted SaaS sold by subscription or licence, and free tools are
hosted too (owner: "hosted saas generally simplifies and is actually better
value for most customers unless there is a speciifc request otherwise";
`../prompts/goals.md`, Mission and "North star"). Don't build new deploy
pages or deployer docs unless a request asks for them.

**Deploy what a bet needs.** A product on `main` with no public URL is worth
deploying when it is a ranked bet or its front door; otherwise it waits
(owner, 2026-11-24: "we don't invest dev effort in sunken ships"). Where to
host: [`portfolio/hosting/`](../portfolio/hosting/README.md).

Target businesses that have money and a real problem — especially tools that
help them earn more. Low variable cost, traditional software, AI
only where it clearly helps. Payment code ships off by default on the deployer's
own keys; the owner's own instances may also sell through the owner's
merchant-of-record hosted checkout, by a link set outside the repo, never a key
(`../prompts/goals.md`, "Payments: the owner's merchant of record, never a key"; owner, 2026-10-31). For-profit is on (owner, 2026-11-01) but never a blocker: a paid path ships dark until the link is set, and nothing waits on it. Free single-purpose tools, calculators included, are demoted:
no new ones and no new depth, except as the front door to a ranked bet or a
fix when broken; already-built work can still be merged (owner, 2026-10-21
and 2026-11-24; `../prompts/goals.md`, "Where effort goes").

Running venture tests: `python3 platform/ci/run_venture_tests.py --changed`
(or named slugs; no args runs all, in minutes). It is the command
`ventures-tests.yml` runs, so a local pass is the CI pass; a venture needs no
`<slug>-ci.yml` just for `node --test`.
