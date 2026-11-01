# Working in `ventures/`

Venture-only rules, moved out of the root `CLAUDE.md` so research and review runs
don't load them. The root file's public-repository, landing and CI rules still apply.

## Product-first default

Every session should move a venture closer to something strangers can use for
free, with usage tracked and disclaimers in place. Features, fixes, landing
pages, SEO, integrations (behind env vars), and VM-runnable apps beat ledger
entries and analysis documents.

**Self-deploy principle (owner, 2026-10-15).** The aim is not for us to host
these apps. Each one is an MIT open-source business that anyone can one-click
host in their own cloud: credentials go in, they click Deploy, OpenTofu does
the rest, and nothing of ours runs in between. This is the business model
(`../prompts/goals.md`, Mission) and the finish line for a venture
(`../prompts/ventures/prompt-1.md`). Details, including how OpenTofu is set up and the Buy Me a
Coffee exception: `../PRODUCT_PLAYBOOK.md` §2, "Rule of thumb: anyone can
deploy it themselves".

**Deploy-first.** Products already on `main` with no public URL outrank new
candidates: give them a way to reach people (a GitHub Pages page, a package,
a release or an app build; there is no static-only or browser-only rule) rather than starting another product
([`portfolio/hosting/`](../portfolio/hosting/README.md)).

Target super-niches where users have money and a real problem — especially
tools that help them earn more. Low variable cost, traditional software, AI
only where it clearly helps. Payment code ships off by default on the deployer's
own keys; the owner's own instances may also sell through the owner's
merchant-of-record hosted checkout, by a link set outside the repo, never a key
(`../prompts/goals.md`, "Payments: the owner's merchant of record, never a key"; owner, 2026-10-31). For-profit is on (owner, 2026-11-01) but never a blocker: a paid path ships dark until the link is set, and nothing waits on it. Calculators are a poor use of a run: a new one rarely beats
what a chatbot gives in one reply, so build depth elsewhere and fix existing
ones only when broken; already-built calculator work can still be merged
(owner, 2026-10-21; `../prompts/goals.md`, "Direction:
depth over calculators").

Running venture tests: `python3 platform/ci/run_venture_tests.py --changed`
(or named slugs; no args runs all, in minutes). It is the command
`ventures-tests.yml` runs, so a local pass is the CI pass; a venture needs no
`<slug>-ci.yml` just for `node --test`.
