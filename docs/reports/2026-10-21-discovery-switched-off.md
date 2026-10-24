# Discovery and distribution: built, switched off: brief for an agent reader

**Date:** 2026-10-21. **Reader:** an LLM agent asked to "do SEO",
"distribute", "post to platforms" or "add a discovery channel" for this
repository. **Human version:**
[`../posts/2026-10-21-thirteen-publishers-zero-posts.md`](../posts/2026-10-21-thirteen-publishers-zero-posts.md).
**Asked by:** the owner, 2026-10-21: "are there any more projects that would
help with seo or discovery for all of this? maybe posting to some platforms
that allow bots to post?"

## Answer

Before building a new channel, check whether the old ones run. On
2026-10-21 none of the 13 `distribute-*` workflows had ever published
anything. Six had run, and every run was a dry run. Seven had never run.
All posts they would make link to a path that 404s. So the order is:

1. Fix the links (`DEFAULT_BASE_URL` and the constants copied from it).
2. The owner adds credentials for the free, bot-permitted platforms.
3. Turn on the visit counter, so the `?ref=` tags can be counted.
4. Only then add channels. The ones worth adding are listed below.

## Evidence (verified 2026-10-21)

Read from GitHub Actions run logs with the GitHub MCP tools. Nothing was
changed.

| Workflow | Runs | Latest run | Outcome |
|---|---:|---|---|
| distribute-bluesky | 6 | 39439400855 | `DRY RUN (set DISTRIBUTE_BLUESKY=true plus BSKY_HANDLE / BSKY_APP_PASSWORD to post)` |
| distribute-mastodon | 6 | 39442575363 | `DRY RUN (set DISTRIBUTE_MASTODON=true plus MASTODON_INSTANCE / MASTODON_TOKEN to post)` |
| distribute-devto | 6 | 39448805644 | `DRY RUN (set DISTRIBUTE_DEVTO=true and DEVTO_API_KEY to create drafts)` |
| distribute-hashnode | 5 | 39451823188 | `DRY RUN (set DISTRIBUTE_HASHNODE=true, HASHNODE_TOKEN and HASHNODE_PUBLICATION_ID ...)` |
| distribute-hub | 1 | 39451831117 | dry run on Threads, Facebook, Instagram and email; wrote an 18-platform drafts pack (artifact 12279181905) |
| distribute-releases | 1 | 39324710257 | `DRY RUN (set DISTRIBUTE_RELEASES=true ...)`. The repo has no GitHub releases. |
| npm, mcp, pypi, pypi-packages, homebrew, ghcr | 0 | n/a | weekly crons, first slot not reached yet |
| desktop | 0 | n/a | `workflow_dispatch` only |

In every log the env block shows the `DISTRIBUTE_*` flag and the credentials
as empty strings. The workflows read the flags from `vars.*` and the
credentials from `secrets.*`, so the repository variables and secrets are
not set; the wiring is not the problem. Note that dev.to and Hashnode
create **drafts** when switched on. Hashnode publishes only with
`HASHNODE_PUBLISH=true`.

**Every product link in those logs is dead.** They read
`https://duncan-haywood.github.io/monorepo-projects/<slug>/?ref=<platform>`.
The repository was renamed to `oss-monorepo`, and GitHub does not redirect
the Pages path of a renamed repository. Measured with `curl` on 2026-10-21:

| URL | HTTP |
|---|---:|
| `https://duncan-haywood.github.io/monorepo-projects/` | 404 |
| `https://duncan-haywood.github.io/oss-monorepo/` | 200 |
| `https://duncan-haywood.github.io/oss-monorepo/robots.txt` | 200 |
| `https://duncan-haywood.github.io/oss-monorepo/sitemap.xml` (1,310 child sitemaps) | 200 |
| `https://duncan-haywood.github.io/robots.txt` (the host root crawlers read) | 404 |

The site build itself is fine. `portfolio-pages.yml` derives
`PAGES_BASE_URL` from the repository name, so canonicals and sitemaps name
`/oss-monorepo/`. The readers that **copy** the old constant are what's
stale:

- `platform/pages/build.mjs` `DEFAULT_BASE_URL`;
- `platform/distribution/bluesky.mjs` `BASE_URL`, which
  `mastodon.mjs` and `devto.mjs` import through `toolUrl`;
- `platform/distribution/hub/compose.mjs` `BASE_URL`;
- the `homepage` in `mcp.mjs`, the `url` in `citation.mjs`, and the
  README links that `npm.mjs` and `pypi.mjs` write;
- `platform/ci/pages_state.py`, which still tells you to open
  `/monorepo-projects/`.

`grep -rn monorepo-projects platform/ --include=*.mjs --include=*.py`
gives the full list.

Open draft PR #8592 changes all of them, along with about 3,550 other files.
It stalled on 2026-10-20 with its verification unfinished. Extend or finish
it; do not open a second rename.

**Measurement is off too.** `platform/counter/site.json` has `"url": ""`, so
no visit beacon is served, and all 460 `live_url_visitors` entries in
`portfolio/usage/usage.yaml` are `null`. If posting were switched on today,
the hub scoreboard could not attribute a single visit. The hub's own log
says so: `No arrivals on file: the site counter is off`.

**Search engines:** IndexNow has been announced (`indexnow_state.py`:
`announced`, run 39531821922). Google does not take IndexNow. The host-root
`robots.txt` is still missing because the `duncan-haywood.github.io`
repository does not exist (`list_repos` found no match). The files for it
are in `platform/pages/user-site/`. Their `Sitemap:` line must name
`/oss-monorepo/`.

## What is the owner's, and what is yours

| Step | Who | Notes |
|---|---|---|
| Finish PR #8592 (or a narrower fix to the readers above) | agent | Do this first. Without it, turning on credentials publishes dead links. |
| Bluesky app password, Mastodon token, dev.to key, Hashnode token, plus `DISTRIBUTE_*=true` | owner | A secret only they hold, posting under the portfolio's name (CLAUDE.md, "Flag the owner"). |
| Create the empty `duncan-haywood.github.io` repo | owner | Sessions get a 403 creating repos. After that, any session pushes `platform/pages/user-site/`. |
| Pick a counter origin for `platform/counter/site.json` | owner | Needs somewhere to host it. Without it, no channel can be ranked. |
| Search Console and Bing Webmaster verification | owner | Optional. Gives impressions data. |

`python3 portfolio/ledger/decision_queue.py` already carries the custom
domain and egress asks. Add to it, don't duplicate.

## New channels, if the above is done

All are free, and automated posting is within each platform's rules as
stated in its own documentation as of mid-2026. Re-check the terms page
before you build an adapter. Each adapter goes into
`platform/distribution/hub/platforms.mjs` as a new entry, off by default,
the way Threads is.

| Channel | Why it helps | Needs |
|---|---|---|
| Official MCP Registry, plus the directories that index it or GitHub (Smithery, Glama, mcp.so) | How agents find tools. `mcp.mjs` already writes `server.json` for the `io.github.duncan-haywood` namespace. | An npm token, so the package exists. Then `mcp-publisher` can sign in with GitHub Actions OIDC, with no extra secret. |
| WebSub ping on `feed.xml` | Feed readers and aggregators update within minutes, not hours. | Nothing. Add `<link rel="hub">` to the feed and POST to a public hub after deploy. **An agent can ship this alone.** |
| Nostr | No API approval, and bots are normal there. | A keypair, which publishes under the portfolio's name, so ask the owner. |
| Telegram channel | Bot API is free, and channels are meant for one-to-many posting. | The owner creates the bot and channel. |
| Lemmy (bot flag set) | Federated, Reddit-like communities that allow bots. | An account. Each community's rules still apply. Post only where they permit it. |
| Zenodo | DOIs for `research/`, indexed by Google Scholar and OpenAIRE. `CITATION.cff` exists. | Owner links GitHub once. Also needs real releases, so `DISTRIBUTE_RELEASES` must be on. |
| Hugging Face datasets or Spaces | Research data and demos, where ML readers look. | A token. |

Do not automate posting to Reddit or Hacker News (both forbid it, and drafts
exist) or X (paid per post since February 2026). Do not open bot pull
requests on "awesome-*" lists, which maintainers treat as spam.

## Traps

- **A green `distribute-*` run is not a post.** Every run above concluded
  `success`. Read the log line, or `hub.mjs score`, before you report
  anything as distributed.
- **Pages builds from the repo name; the posters don't.** Any new adapter
  should import its base URL from one place, not copy the literal. This is
  the same trap CLAUDE.md's "168 became 169" story describes.
- **Never measured is not zero.** No channel can be retired or ranked until
  `site.json` has a counter.
