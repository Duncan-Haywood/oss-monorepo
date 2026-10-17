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
candidates. Prepare a GitHub Pages artifact or a Hetzner product-box
deploy; do not clone another undeployed calculator. The host is decided
([`portfolio/hosting/`](../portfolio/hosting/README.md)). The owner flip is
`deploy-settings` — do not add a second ask. See `../portfolio/DIRECTION.md`.

Target super-niches where users have money and a real problem — especially
tools that help them earn more. Low variable cost, traditional software, AI
only where it clearly helps. Payment code is allowed only off by default and on
the deployer's own keys, never the owner's accounts (`../prompts/goals.md`,
"Payments: never the owner's"); the owner's own instances take GitHub Sponsors
donations only. Prefer higher-value work to another single-page calculator: a
principle, not a ban (owner, 2026-10-16; `../prompts/ventures/prompt-1.md`).
