# Working in `ventures/`

Venture-only rules, moved out of the root `CLAUDE.md` so research and review runs
don't load them. The root file's public-repository, landing and CI rules still apply.

## Product-first default

Every session should move a venture closer to something strangers can use for
free, with usage tracked and disclaimers in place. Features, fixes, landing
pages, SEO, integrations (behind env vars), and VM-runnable apps beat ledger
entries and analysis documents.

**Freemium, hosted by the LLC (owner, 2026-11-22).** Products are freemium
SaaS run by Maris Stella Labs LLC: the free path works with no account, and
Pro adds depth on the shared accounts and Paddle billing in `platform/saas`,
inside coded cost caps (`../prompts/goals.md`, "The business model" and
"Operating hosted services"). New product code is under FSL-1.1-MIT. This
replaces the 2026-10-15 self-deploy principle, which stays allowed as an
option (`../PRODUCT_PLAYBOOK.md` §2 and §6). Which products go paid first:
`../docs/reports/2026-11-22-freemium-saas-plan.md`.

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
