# Distribution: state on 2026-10-29

Asked for by the owner on 2026-10-29: "let's work more on distribution in
general ideally getting users on this even if not paying yet. agent time going
to distribution rather than $ spend. do a report on the state of this."

Every number below was read on 2026-10-29 from the command named next to it.

## Summary

- **Built: 33 channels. Live: 0.** Every row in
  `portfolio/distribution/channels.yaml` is at the `artifact` rung (listing
  and dry run built, nothing published). Rungs counted with
  `grep rung: portfolio/distribution/channels.yaml`.
- **Users measured: about 24 page loads in total, ever.** The counter has been
  live since 2026-10-24 (`curl <counter>/counts`, the URL is in
  `platform/counter/site.json`). Its whole record is 3 days with hits:
  2026-10-24 (13), 2026-10-26 (7), 2026-10-28 (4). They land on `about`,
  `ask`, `c` and one story page. **No tool page has a single recorded load.**
  Those hits are consistent with the owner and agents checking the site, so
  the honest reading is that strangers are not arriving yet. (Browsers that
  send DNT or GPC are not counted, so this is a floor, not a census.)
- **Search does not show the site.** A web search for
  `"duncan-haywood.github.io"` returns this repository's GitHub pull
  requests, not one page of the site. Search engines index the repository on
  github.com; they have not surfaced the 1,319 tool pages.
- **The site is built well for discovery.** A sitemap index (1,319 child
  sitemaps), canonical tags, breadcrumb and FAQ structured data, `llms.txt`
  (329 lines), IndexNow announced for Bing and Yandex
  (`platform/ci/indexnow_state.py`: "The live snapshot has been announced").
  The pages are not the problem; nothing points crawlers or people at them.

## Why nothing is live

The distribution spec (`portfolio/distribution/README.md`, "The owner gate")
has agents build each channel off by default and the owner turn it on with
one account and one variable. Agents built all 33; none has been switched on.
The owner's decision queue (`python3 portfolio/ledger/decision_queue.py`)
holds 13 items, the oldest 71 days old. So more pipelines are not the lever.
The lever is either the owner's few minutes, or work an agent can finish
without an account.

## What an agent can do without the owner (and what this run did)

Channels that need no account are the only ones an agent can move on its own.
Three of them have been usable since 2026-10-17 without anyone knowing:

| Channel | Works today | Was it on the tool page? |
|---|---|---|
| GitHub Action (`uses: …/platform/distribution/actions/<slug>@main`) | yes, 20 linters | no |
| pre-commit hook (`.pre-commit-hooks.yaml`) | yes, same 20 | no |
| Nix flake app (`nix run github:…#<slug>`) | yes, same 20 | no |
| Single-file download (`<site>/<slug>/check.py`, stdlib only) | yes, served by Pages | no |

**Shipped in this PR:** the entry page of each of those linters (19; the 20th,
`actions-continue-on-error-check`, has no page yet) now carries
a "Run this check from a terminal, in CI or as a pre-commit hook" box in its
footer, with the four snippets above (`renderCiInstall` in
`platform/pages/build.mjs`, tests in `platform/pages/ci-install.test.mjs`).
It is gated on the generated action file existing, and the test checks that
every such linter also has a hook, a flake app and a `check.py`, so a snippet
cannot point at nothing. The page is honest about the Action's cost: it
fetches this whole repository (about 1 GB of tree), so the one-file route is
listed first.

Why this one: a developer who finds a linter page is the visitor most likely
to become a repeat user, and until today the page gave them no way to keep
using it. It moves usage from "visited once" to "runs on every push".

Other agent-only work worth doing next, best first:

1. **Make the repository's own GitHub page the front door.** Search engines
   already index github.com/Duncan-Haywood/oss-monorepo and its PRs. The root
   `README.md` links the site 6 times; a short "most-used tools" block near
   the top, linking specific tool pages, gives crawlers and readers a path
   from the indexed page into the site. Cheap, no account.
2. **Wire `?ref=` tags into the three untagged channels** (pre-commit, Nix,
   Zenodo; `node platform/distribution/attribution.mjs` lists them as
   "untagged"), so their arrivals can be told apart once there are any.
3. **Keep the drafts pack fresh** (`node platform/distribution/hub.mjs pack`)
   so the owner's hand-posting step, if they take it, is copy and paste.

What an agent should not do: post to any community, open PRs on other
people's awesome-lists, or create accounts. Those publish under the owner's
name and are theirs (`CLAUDE.md`, "Flag the owner"; distribution README,
"Never").

## The owner's cheapest switches, ranked by minutes per reach

All free, none needs a card. Each is already described in full in the
decision queue or `channels.yaml`; this is the order to do them in.

1. **A two-line `robots.txt` at the host root** (about 5 minutes): create a
   public repository named `duncan-haywood.github.io` with `robots.txt`
   holding `User-agent: *` and
   `Sitemap: https://duncan-haywood.github.io/oss-monorepo/sitemap.xml`.
   Today `https://duncan-haywood.github.io/robots.txt` returns 404, so no
   crawler has ever been told the sitemap exists
   (`python3 platform/ci/pages_state.py`, the `indexing` row). This is the
   single largest search fix available and needs no domain.
2. **Google Search Console** (about 10 minutes): add the URL-prefix property
   and submit the sitemap. Google does not take IndexNow, so it is the one
   big engine nothing has reached.
3. **`DISTRIBUTE_RELEASES=true`** (1 minute, one repository variable, no
   account): the weekly GitHub release digest, which also unlocks the Zenodo
   DOI channel.
4. **`DISTRIBUTE_GHCR=true`** (1 minute, no account): container images.
5. **Bluesky** (about 10 minutes): a labelled bot account, an app password,
   two secrets. The cheapest social channel that allows automated posting.

## Measuring whether it works

The counter is live, and `ref:` and `src:` keys are already in its schema, so
the next report can read arrivals per channel directly from
`portfolio/usage/site-visits.json` once the daily pull
(`.github/workflows/site-usage-pull.yml`) has committed them. The test of this
run's change is simple: any non-zero load on one of the 20 linter pages, and
later any `src:` from github.com. Re-read in two weeks.

## Stale facts noticed in passing

Decision-queue row 3 still gives the site's
old address, `/monorepo-projects/` (`portfolio/usage/README.md` did too; fixed in this PR), which has returned 404 since the
repository was renamed. The live address is `/oss-monorepo/`.
