# Working in `ventures/`

Venture-only rules, moved out of the root `CLAUDE.md` so research and review runs
don't load them. The root file's public-repository, landing and CI rules still apply.

## Product-first default

Every session should move a venture closer to a paid product people buy:
hosted, priced at about cost plus 100%, with free trials or lead magnets in
front, analytics under a normal privacy policy, and disclaimers in place
(owner, 2026-11-21; `../prompts/goals.md`, "The 2026-11-21 pivot"). Features,
fixes, landing pages, SEO, integrations and running apps beat ledger entries
and analysis documents. Construction is the ventures track's lead area
("one tool for literally everything" a construction or development company
does), then deep tech and research turned into products. Small-business and
nonprofit suites have their own track (`../portfolio/smb/`).

The 2026-10-15 self-deploy model (each venture an MIT business anyone
one-click hosts, the owner hosting nothing) is superseded as the goal; keep
self-deploy only where it costs nothing (`../PRODUCT_PLAYBOOK.md` §2).

**Deploy-first.** Products already on `main` with no public URL outrank new
candidates: give them a way to reach people (a GitHub Pages page, a package,
a release or an app build; there is no static-only or browser-only rule) rather than starting another product
([`portfolio/hosting/`](../portfolio/hosting/README.md)).

Target super-niches where users have money and a real problem — especially
tools that help them earn more. Low variable cost, traditional software, AI
only where it clearly helps. Payment code ships off by default on the deployer's
own keys; the owner's own instances may also sell through the owner's
merchant-of-record hosted checkout, by a link set outside the repo, never a key
(`../prompts/goals.md`, "Payments: the owner's merchant of record, never a key"; owner, 2026-10-31). For-profit is on (owner, 2026-11-01), and since 2026-11-21 paid is the default; nothing waits on the checkout link (a labelled free early-access period shows the planned price until it exists). Calculators are a poor use of a run: a new one rarely beats
what a chatbot gives in one reply, so build depth elsewhere and fix existing
ones only when broken; already-built calculator work can still be merged
(owner, 2026-10-21; `../prompts/goals.md`, "Direction:
depth over calculators").

Running venture tests: `python3 platform/ci/run_venture_tests.py --changed`
(or named slugs; no args runs all, in minutes). It is the command
`ventures-tests.yml` runs, so a local pass is the CI pass; a venture needs no
`<slug>-ci.yml` just for `node --test`.
