# Distribution: automated, unpaid, within every platform's rules

**Long-term goal, set by the owner on 2026-10-15** (stated in
[`prompts/goals.md`](../../prompts/goals.md)). This file is the working spec
behind that goal: which channels count, what "compliant" means, how the
owner gate works, and how to measure it.

## The goal in one paragraph

Get the portfolio's free products and research in front of far more of the
people they are for, **automatically, without paying for advertising, and
without breaking any platform's terms or any law.** Treat it as sales with
no sale at the end: the funnel ends in a stranger using a free tool, not in
a payment. Search and AI-assistant discovery (sitemaps, JSON-LD, `llms.txt`,
IndexNow, the Atom feed) are already built; this goal widens that to the
natural distribution platforms where the users already are, and makes
publishing to them a pipeline rather than a one-off favour.

This is a direction for many runs, not one run's task. A session that has
spare scope, or a ventures/explore run that wants a lever bigger than one
more page, can pick a channel below and move it one step along the ladder.

## What counts as a natural distribution platform

A channel qualifies when people go there to *find* a tool like ours and the
platform invites publishing to it, ideally through an API or a
manifest-driven listing:

- **Search engines and AI assistants**: sitemaps, structured data, IndexNow,
  `llms.txt`. Already shipping; keep it current.
- **Package registries**: npm, PyPI, crates.io, Homebrew taps, Docker Hub /
  GHCR, for CLIs and libraries.
- **App, extension and plugin stores**: VS Code Marketplace / Open VSX,
  Chrome Web Store, Firefox Add-ons, WordPress.org, GitHub Marketplace
  (Actions), Raycast/Alfred stores, MCP server registries.
- **Developer and product directories that accept submissions by API or
  pull request**: e.g. a well-fitting awesome-list (one PR, its own
  contributing rules followed), AlternativeTo, public-APIs-style indexes.
- **Content syndication with a canonical link back**: our own Atom/RSS feed,
  dev.to / Hashnode style APIs that support `canonical_url`, a GitHub
  release with notes.
- **Openly automated social accounts**: e.g. Mastodon or Bluesky accounts
  that are labelled as bots, post only what they say they post (new
  launches, release notes), and follow each instance's bot rules.
- **An X account** (owner suggestion, 2026-10-15): the same pattern,
  labelled as automated in X's account settings and bio, posting launches
  and releases through the API's free tier, within its current posting
  limits and automation rules. Read those on the day you build it, because
  they change often. If the free tier no longer allows posting, the channel
  is drafts for the owner, never a paid tier.
- **An opt-in email list** (owner suggestion, 2026-10-15): a "get new tools
  by email" signup on the home page, with double opt-in, one-click
  unsubscribe, and only what the signup promised. Use a provider's free
  tier, or a feed-to-email service on our own Atom feed. CAN-SPAM requires
  a postal address in every email, so choosing which address to show is an
  owner decision to raise when the channel is built. Subscribers' addresses
  are personal data: they live with the provider, never in this repository.
- **Research**: the GitHub Pages site, `CITATION.cff`, Zenodo DOIs, Papers
  with Code-style indexes. Publishing a preprint (arXiv) is under the
  owner's name and stays theirs.

What does **not** count, however automatable: anything below under "never".

## Compliance: the rules every channel follows

Before a channel is automated, record in [`channels.yaml`](channels.yaml)
(create it with the first channel) the date its terms were read and the
specific clauses that permit what we do: API terms, automation and bot
rules, self-promotion rules, rate limits. A channel whose terms forbid
automated posting is done by hand by the owner or not at all.

Always:

- Follow the platform's terms of service, API terms, rate limits,
  `robots.txt` and community self-promotion rules, as written on the day.
- Disclose: bot accounts are labelled as bots, every listing says it is
  free open-source software from this portfolio, and AI assistance is
  stated where `goals.md` requires it.
- Say only true things. Listings carry the same disclaimers, privacy line
  and honest limits as the product page (`PRODUCT_PLAYBOOK.md` §5), and
  competitor names follow §5f.
- Link back to the canonical page, so usage is counted where
  `portfolio/usage/` already counts it. A per-channel `?ref=<channel>` tag is
  fine; anything that identifies a person is not.
- Publish once per real event (a launch, a release, a substantive update).
  Re-posting unchanged items is spam even where the platform would allow it.

Never:

- Unsolicited email, DMs, comments or mentions, cold outreach of any kind,
  or scraping contact details (CAN-SPAM, GDPR, CASL, PECR and most
  platforms' rules). Opt-in channels people subscribed to are fine.
- Fake, duplicate or sock-puppet accounts, astroturfing, fake reviews or
  ratings, vote or star manipulation, engagement pods, or posting as if we
  were an unaffiliated user.
- Automated posting to communities that forbid it (most subreddits, Hacker
  News, Stack Overflow, Discord/Slack servers, forums). These can be
  prepared as drafts for the owner; they are never automated.
- Paid placement, ads, boosted posts or anything that spends money. Unpaid
  means unpaid.
- Contacting the professors, labs or authors a research project cites
  (research guardrail in `goals.md`).
- Evading a ban, rate limit, CAPTCHA or bot detection. If a platform says
  no, the answer is no.

## The owner gate (how this fits the existing rules)

Creating accounts and publishing under the portfolio's public name are
owner-only (`CLAUDE.md`, "Only flag the owner"), and unattended workflows
that post need owner approval (`CLAUDE.md`, "Automation"). This goal does
not relax either. It changes what agents build so that the owner's part is
one switch per channel:

1. **Agents build the pipeline, off by default**: the listing artifact
   (manifest, description, screenshots, category), the publish script, a
   dry-run mode that prints exactly what would be posted, tests, and the
   `channels.yaml` row with the terms reading.
2. **One owner ask per channel**, through `decision_queue.py` (never a
   duplicate): create the account, store its token as a repository secret,
   set the channel's enabling variable (e.g. `DISTRIBUTE_NPM=true`).
3. **Then it runs unattended**, on the same events the Pages publish runs
   on, with no further asks. A channel whose variable is unset does a dry
   run and nothing else, the same pattern as `PAGES_BRANCH_PUBLISH`.

Never put a token in the tree, a log or a PR. A pipeline that needs a paid
API is out of scope for this goal.

## The ladder, per channel

`none` → `artifact` (listing prepared, dry run passes) → `queued` (owner
ask filed) → `live` (publishing automatically) → `measured` (usage from
that channel is counted). Move one channel one rung; that is a whole
contribution.

## Measuring it

Progress is the number of products with at least one `live` channel beyond
search, and the usage those channels bring, read from
`portfolio/usage/usage.yaml` by `ref` tag. "Never measured" is not zero
(`goals.md`). Record readings, not estimates.

## Related

- [`portfolio/pipeline/channel-inventory.md`](../pipeline/channel-inventory.md):
  what each listing channel costs in credentials, and which ones were
  measured unreachable from a session sandbox. Read its amendment first:
  the fix for "unreachable from here" is a runner-side, owner-enabled
  pipeline, which is exactly the ladder above.
- `PRODUCT_PLAYBOOK.md` §5e (discoverability), §5f (naming competitors).
- `platform/ci/indexnow_state.py`, `platform/pages/launched.mjs`: the
  search-side distribution already built.

## Channel status

See [`channels.yaml`](channels.yaml). `bluesky-bot` is at `artifact`:
`node platform/distribution/bluesky.mjs` prints the posts a run would send;
the owner step is the account, two secrets and `DISTRIBUTE_BLUESKY=true`.

`mastodon-bot` is also at `artifact` (2026-10-15): same pattern as Bluesky, plus a refusal to post from an account not flagged as a bot. Dry run: `node platform/distribution/mastodon.mjs`.

`hashnode-crosspost` is at `artifact` (2026-10-15): the dev.to pattern on Hashnode's GraphQL API (drafts by default, canonical link back). Dry run: `node platform/distribution/hashnode.mjs`.

`github-release-digest` is at `artifact` (2026-10-15): a weekly release on this repository listing the week's launches, needing no external account (only `DISTRIBUTE_RELEASES=true`). Dry run: `node platform/distribution/releases.mjs`.

`npm-cli-packages` is at `artifact` (2026-10-15): 142 venture CLIs become `npx`-runnable npm packages, five new ones per weekly run, none overwritten. Dry run: `node platform/distribution/npm.mjs`; inspect one with `node platform/distribution/npm.mjs --pack <slug> <dir>`. Owner step: npm account, `NPM_TOKEN`, optional `NPM_SCOPE`, `DISTRIBUTE_NPM=true`.

`mcp-server` is at `artifact` (2026-10-16): one npm package, an MCP server that lets Claude Desktop, Cursor and VS Code search and run 133 venture CLIs locally, with a generated `server.json` for the official MCP registry. Dry run: `node platform/distribution/mcp.mjs` (`--skipped` lists the 9 excluded for network or process access, `--pack <dir>` writes the package). Owner step: the npm token from `npm-cli-packages` and `DISTRIBUTE_MCP=true`.

`pypi-python-clis` is at `artifact` (2026-10-16): 22 stdlib-only Python venture CLIs (the `*-check` linters) become `pipx run`-able PyPI projects, five new per weekly run, none overwritten. Dry run: `node platform/distribution/pypi.mjs`; inspect one with `node platform/distribution/pypi.mjs --pack <slug> <dir>`.

`pypi-pyproject-packages` is at `artifact` (2026-10-16): the five dependency-free Python ventures that already have a pyproject become PyPI projects, three new per weekly run; same owner step as `pypi-python-clis`. Dry run: `node platform/distribution/pypi-packages.mjs`.

`homebrew-tap` is at `artifact` (2026-10-16): formulas for the venture CLIs that npm-cli-packages has published, written into the owner's own tap repository (`brew install <tap>/<slug>`); needs `DISTRIBUTE_NPM` live first. Dry run: `node platform/distribution/homebrew.mjs`.

`ghcr-container-images` is at `artifact` (2026-10-16): each venture CLI also becomes `ghcr.io/<owner>/<slug>`, runnable with `docker run --rm -v "$PWD:/work" ghcr.io/<owner>/<slug> <args>`, five new per weekly run. It needs no account or secret beyond this repository: only `DISTRIBUTE_GHCR=true`, then making the first packages public. Dry run: `node platform/distribution/ghcr.mjs` (`--pack <slug> <dir>` writes the build context).
