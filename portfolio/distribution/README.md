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

## Allow-list and versions

**Since 2026-10-30, a tool reaches a registry or a release only if it is on
[`allowlist.json`](allowlist.json).** Before that, the npm channel would have
published every one of 180 qualifying CLIs and PyPI every one of 24. npm's
and PyPI's policies on spam and name squatting (`channels.yaml` lists them
for the owner to confirm) weigh against bulk-publishing near-identical small
packages, so the channels now publish a curated set, and each entry says why
it earns a package. The npm, PyPI, Homebrew and GHCR publishers and the
release channel all read the list. Add a tool with one entry: `slug`,
`channels` (`release`, `npm`, `pypi`, `pypi-packages`) and `why`. Then run
`node platform/distribution/versions.mjs --write`.

Where a family of checks has an umbrella product, publish the umbrella. The
security `*-check` linters ship inside devsec-toolkit, so they get release
tags (for `uses:` and pre-commit pins) but no registry package each.

**Versions follow what ships.** [`versions.json`](versions.json) holds each
allow-listed tool's version and a SHA-256 over the files its channels would
publish: the npm and PyPI package contents (built at a placeholder version),
its composite action and `check.py`, and devsec-toolkit's `bundle` output.
Editing a test or a page leaves the version alone. Editing a shipped file
makes `versions.mjs --check` fail until `--write` bumps the patch. The
`Distribution versions` workflow runs that check on pull requests. For a
minor or major release, run `--write` and then raise `version` by hand. The
check compares hashes only, so the raised number stands.

Each publisher then asks the registry for that exact version. It publishes
it when missing, skips it when present, and skips with a note any name that
belongs to another project (judged by the repository URL in the registry's
record). On 2026-10-30 that applied to `llm-spend-guard` and
`llms-txt-generator` on npm, which can only go out under `NPM_SCOPE`.

**Releases** ([`tool-releases.mjs`](../../platform/distribution/tool-releases.mjs),
off until `DISTRIBUTE_TOOL_RELEASES=true`) create one tag `<slug>-v<version>`
and one GitHub release per allow-listed version on `main`, at most five per
run. A run refuses to tag while `versions.json` is stale, so a tag's content
always matches its recorded hash. devsec-toolkit's release attaches a
reproducible `devsec-toolkit-<version>.tar.gz` (its `bundle`, about 130 KB,
with `VERSION` stamped) and its SHA-256. A user can then pin
`uses: duncan-haywood/oss-monorepo/platform/distribution/actions/<slug>@<slug>-v0.1.0`
or a pre-commit `rev:` instead of following `@main`.

A tag does not shrink what a `uses:` line downloads, which is still the
whole repository (about 900 MB of tracked files on 2026-10-30). Only a
standalone repository per action fixes that, and creating one is the
owner's step (devsec-toolkit `ROADMAP.md`, phase 5).

## The hub: every platform from one command, and what works best

**Owner request, 2026-10-20:** output to "most platforms" (Substack,
Instagram, Facebook, Threads, X, TikTok, YouTube, email, search, AI
assistants) from one tool that also measures what does best.
[`platform/distribution/hub.mjs`](../../platform/distribution/hub.mjs) is
that tool:

```
node platform/distribution/hub.mjs platforms          # 18 platforms: mode, limits, how to enable, what it measures, why
node platform/distribution/hub.mjs plan               # dry run: every platform's text for recent tools and posts
node platform/distribution/hub.mjs pack --out <dir>   # paste-ready drafts per platform + drafts.csv
node platform/distribution/hub.mjs publish            # live where enabled, dry run elsewhere
node platform/distribution/hub.mjs score              # scoreboard: platforms and copy templates
```

- **One item, one fitted variant per platform** (`hub/compose.mjs`): new
  tools from `launched.json` and new posts from `docs/posts/`. Each variant
  fits the platform's limits, uses only the item's own title and
  description, links back with the platform's `?ref=` tag, and says it is
  free and open source. Video platforms get a 30-second script, Hacker News
  a Show HN title, email a weekly digest.
- **Mode per platform** (`hub/platforms.mjs`, with the day each fact was
  read): `api` (Threads, Facebook Page, Instagram, Buttondown email; off
  until `DISTRIBUTE_<PLATFORM>=true` plus secrets), `delegated` (Bluesky,
  Mastodon, dev.to, Hashnode: the existing scripts), `draft` (X, LinkedIn,
  Substack, Medium, TikTok, YouTube, Reddit, Hacker News: drafts only, with
  the reason) and `discovery` (search engines and AI assistants: nothing to
  post). **X is drafts-only** because its API became pay-per-use for new
  developers on 2026-02-06, and unpaid means unpaid.
- **Measuring what works** (`hub/metrics.mjs`): per-post numbers where the
  platform lets us read them (Bluesky and Mastodon publicly, Threads
  Insights, Facebook and Instagram fields, dev.to views), joined with the
  site's own `ref:<tag>` arrivals. Platforms are ranked by arrivals per post,
  shrunk toward the mean so two lucky posts do not beat fifty steady ones,
  and nothing with fewer than 5 posts is ranked. Short posts rotate between
  honest copy templates (`TEMPLATES`, a deterministic pick per item and
  platform), and the scoreboard compares templates by engagement relative to
  each platform's own average.
- **Workflow** [`distribute-hub.yml`](../../.github/workflows/distribute-hub.yml):
  daily, dry run unless enabled, uploads the drafts pack and
  `scoreboard.json` as a run artifact. It pushes no commits.

The `?ref=` tags it adds (`threads`, `facebook`, `instagram`, `email`, `x`,
`linkedin`, `substack`, `medium`, `tiktok`, `youtube`, `reddit`, `hn`) are in
the counter's closed list and in `channels.yaml` as `hub-*` rows.

## Short-form video

**Owner request, 2026-10-24:** "automated short form video content".
The hub already wrote a 30-second script per item for TikTok and YouTube
Shorts; [`platform/distribution/shorts.mjs`](../../platform/distribution/shorts.mjs)
now renders that script into a finished video, so the only step left by hand
is the upload.

```
node platform/distribution/shorts.mjs plan                         # the storyboard per recent tool or post
node platform/distribution/shorts.mjs render --out shorts          # one video per item in the hub window
node platform/distribution/shorts.mjs render --out shorts --slug ai-bookkeeper,wall-framing-takeoff
  [--piper <exe> --model <voice.onnx>]                             # optional offline narration (the podcast's voice)
```

Each video is 1080x1920, 30 fps, H.264 with an AAC track, about 30 seconds:
a hook card, a card with the item's first sentence, then **the real
published page** on a phone-sized screen, with its own worked example
loaded, scrolled down to its answer, then a hold on that answer captioned
with a figure read off the page ("432 of 870: Units in the first container"),
then a closing card (free and open source, not professional advice). Next to
it go `short.srt`, `poster.png` and `post.md` (the TikTok caption and
YouTube title and description from the hub, links tagged `?ref=tiktok` and
`?ref=youtube`, so arrivals land on the scoreboard).

Honesty rules the renderer keeps (tested in `shorts.test.mjs`):

- Every word comes from the page: the cards use the title and description
  the hub uses, and the figure is text the page showed, read from a named
  answer (a "Result" heading's section or an output region), never from an
  axis tick or a numbered step.
- Captions claim only what the capture did: "its own worked example, loaded"
  only when an example button was pressed, "scrolled to its main result"
  only when one was found. Otherwise the caption says less.
- Nothing is uploaded. Both platforms lock API uploads from unaudited apps to
  private, and posting under the portfolio's name is the owner's call.

**Workflow** [`distribute-shorts.yml`](../../.github/workflows/distribute-shorts.yml):
daily and on demand (`slugs`, `narrate`), renders the hub window with Piper
narration when the voice installs and silent otherwise, and uploads the
videos as a 14-day run artifact. It pushes no commits and calls no paid API.

## Drafts for the venues that forbid automation

`node platform/distribution/launch-kit.mjs [--slug <slug>] [--days 7] [--max 3]`
prints paste-ready drafts (Show HN, Product Hunt, AlternativeTo, an
awesome-list line, a Reddit note) for recent launches. It sends nothing; the
owner posts by hand after reading each venue's rules that day. Links are the
plain canonical URL, so visits from these venues are not counted by `ref`
until a tag is added to the counter's closed list.

## The ladder, per channel

`none` → `artifact` (listing prepared, dry run passes) → `queued` (owner
ask filed) → `live` (publishing automatically) → `measured` (usage from
that channel is counted). Move one channel one rung; that is a whole
contribution.

## Measuring it

Progress is the number of products with at least one `live` channel beyond
search, and the usage those channels bring, read by `ref` tag. "Never
measured" is not zero (`goals.md`). Record readings, not estimates.

The `ref` tags are wired end to end (2026-10-16):

- Every channel's link back to a tool page goes through `tagUrl` in
  [`platform/distribution/attribution.mjs`](../../platform/distribution/attribution.mjs),
  which adds `?ref=<tag>` from a closed list (`CHANNEL_REFS`: `npm`, `pypi`,
  `bluesky`, `release`, ...). Canonical URLs (dev.to `canonical_url`,
  Hashnode `originalArticleURL`) stay clean.
- The site's shared chrome sends a known tag with the counter ping and
  removes it from the address bar, so a re-shared link is not credited twice.
- The counter (`platform/counter/`) adds one to `ref:<tag>` per day beside
  the page's own count; `pull.mjs` commits it to
  `portfolio/usage/site-visits.json` with everything else.
- `node platform/distribution/attribution.mjs` prints each channel's rung,
  tag and reading, and marks a channel ready for `measured` once a non-zero
  count is on file. Until the counter is on it says "no reading", not 0.

A new channel adds its tag to `CHANNEL_REFS` and to the counter's `REFS`
(one test fails if they drift) and passes its links through `tagUrl`.

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

`tool-releases` is at `artifact` (2026-10-30): a `<slug>-v<version>` tag and release per allow-listed tool version (31 tools), so `uses:` and pre-commit can pin a version; devsec-toolkit's release carries its bundle. Needs no external account, only `DISTRIBUTE_TOOL_RELEASES=true`. Dry run: `node platform/distribution/tool-releases.mjs`.

`github-release-digest` is at `artifact` (2026-10-15): a weekly release on this repository listing the week's launches, needing no external account (only `DISTRIBUTE_RELEASES=true`). Dry run: `node platform/distribution/releases.mjs`.

`npm-cli-packages` is at `artifact` (2026-10-15): venture CLIs become `npx`-runnable npm packages, five per weekly run, none overwritten; since 2026-10-30 only the 7 on the allow-list (see "Allow-list and versions"). Dry run: `node platform/distribution/npm.mjs`; inspect one with `node platform/distribution/npm.mjs --pack <slug> <dir>`. Owner step: npm account, `NPM_TOKEN`, optional `NPM_SCOPE`, `DISTRIBUTE_NPM=true`.

`mcp-server` is at `artifact` (2026-10-16): one npm package, an MCP server that lets Claude Desktop, Cursor and VS Code search and run 133 venture CLIs locally, with a generated `server.json` for the official MCP registry. Dry run: `node platform/distribution/mcp.mjs` (`--skipped` lists the 9 excluded for network or process access, `--pack <dir>` writes the package). Owner step: the npm token from `npm-cli-packages` and `DISTRIBUTE_MCP=true`.

`pypi-python-clis` is at `artifact` (2026-10-16): stdlib-only Python venture CLIs become `pipx run`-able PyPI projects, five per weekly run, none overwritten; since 2026-10-30 only the 3 on the allow-list. Dry run: `node platform/distribution/pypi.mjs`; inspect one with `node platform/distribution/pypi.mjs --pack <slug> <dir>`.

`pypi-pyproject-packages` is at `artifact` (2026-10-16): dependency-free Python ventures that already have a pyproject become PyPI projects, three per weekly run; same owner step as `pypi-python-clis`. None is allow-listed on 2026-10-30, so it publishes nothing until one is. Dry run: `node platform/distribution/pypi-packages.mjs`.

`homebrew-tap` is at `artifact` (2026-10-16): formulas for the venture CLIs that npm-cli-packages has published, written into the owner's own tap repository (`brew install <tap>/<slug>`); needs `DISTRIBUTE_NPM` live first. Dry run: `node platform/distribution/homebrew.mjs`.

`ghcr-container-images` is at `artifact` (2026-10-16): each venture CLI also becomes `ghcr.io/<owner>/<slug>`, runnable with `docker run --rm -v "$PWD:/work" ghcr.io/<owner>/<slug> <args>`, five new per weekly run. It needs no account or secret beyond this repository: only `DISTRIBUTE_GHCR=true`, then making the first packages public. Dry run: `node platform/distribution/ghcr.mjs` (`--pack <slug> <dir>` writes the build context).

`zenodo-citation` is at `artifact` (2026-10-16): the research portfolio becomes citable. A root `CITATION.cff` gives GitHub's "Cite this repository" box, and `research/CITATIONS.bib` holds one BibTeX entry for each of the 463 research projects. The owner step is one switch in Zenodo's GitHub integration, after which each weekly release (`github-release-digest`) is archived with a DOI. Dry run: `node platform/distribution/citation.mjs` (`--write` regenerates, `--check` exits 1 when stale).

`browser-extension` is at `artifact` (2026-10-16): any static venture page becomes a Manifest V3 extension that opens the tool offline from the toolbar, with no permissions and no remote code (1,184 of 1,251 pages qualify). Dry run: `node platform/distribution/webext.mjs`; build one with `node platform/distribution/webext.mjs --build <slug> <dir>`. Owner step: a Chrome Web Store (or Edge / Firefox) developer account, then upload one tool's zip at a time; the stores' repetitive-content rules mean a handful of weekly-return tools, not the catalogue.

`vscode-extension` is at `artifact` (2026-10-16): one dependency-free VS Code / Open VSX extension, "Free Tools Catalogue", puts all launched tools in a command-palette quick-pick that opens the tool's page. No network code and no telemetry. Dry run: `node platform/distribution/vscode.mjs`; build with `--build <dir>`. Owner step: an Open VSX namespace (or VS Code Marketplace publisher) and one `ovsx publish`.

`github-actions` is at `artifact` (2026-10-16): 18 stdlib-only `*-check` linters become reusable composite actions anyone can add to CI with one line, `uses: duncan-haywood/oss-monorepo/platform/distribution/actions/<slug>@main`, with `path`, `fail-on-risk` and `format` inputs. It needs no account, token or publish step. Dry run: `node platform/distribution/ghaction.mjs` (`--write` regenerates, `--check` exits 1 when stale).

`pre-commit-hooks` is at `artifact` (2026-10-17): the same linters as `github-actions` also become hooks in a root `.pre-commit-hooks.yaml`, so `repo: https://github.com/duncan-haywood/oss-monorepo` plus a hook id in a `.pre-commit-config.yaml` runs them locally and in CI. It needs no account, token or publish step. Dry run: `node platform/distribution/precommit.mjs` (`--write` regenerates and sets the scripts executable, `--check` exits 1 when stale).

`nix-flake` is at `artifact` (2026-10-17): the same linters are also packages and apps of a root `flake.nix`, so `nix run github:duncan-haywood/oss-monorepo#actions-timeout-check -- --fail-on-risk .` runs one with nothing installed. It needs no account, token or publish step. Dry run: `node platform/distribution/nixflake.mjs` (`--write` regenerates, `--check` exits 1 when stale).

`desktop-apps` is at `artifact` (2026-10-20): any static venture page (1,213 of 1,285), or a catalogue section as a suite with a launcher, becomes an offline Tauri v2 desktop app for macOS, Windows and Linux. The CSP blocks the network, the page gets no native capability, and links that leave the bundle open in the browser. Dry run: `node platform/distribution/desktop.mjs` (`--suites` lists suites, `--build <slug|suite> <dir>` writes the project). `.github/workflows/distribute-desktop.yml` is manual only and needs `DISTRIBUTE_DESKTOP=true`. It builds unsigned .dmg, .msi/.exe, .AppImage and .deb installers and attaches them, with winget manifests, to a pre-release. Verified on Linux only: the generated project compiled and rendered offline. Owner steps: signing, notarisation and the winget submission. Flatpak and Snap are follow-ups described in the generated BUILD.md.

`wordpress-plugin` is at `artifact` (2026-10-19): one plugin, "Free Tools Embed", whose `[free_tool slug="..."]` shortcode embeds any launched tool as a sandboxed iframe with a link back. Dry run: `node platform/distribution/wordpress.mjs` (`--build <dir>` writes the zip). Owner step: a wordpress.org account and a submission.

The distribution hub (2026-10-20) adds `hub-threads`, `hub-facebook`, `hub-instagram` and `hub-email` at `artifact` (live adapters, off by default) and eight `hub-*-drafts` rows for platforms that cannot be automated within their terms for free. Dry run: `node platform/distribution/hub.mjs plan`.
