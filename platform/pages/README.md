# Portfolio Pages

The public site. `build.mjs` assembles every static, browser-runnable venture
surface in this repository into one GitHub Pages deployment, behind a hub page
that lists and searches them.

```
node platform/pages/build.mjs --out=dist          # build
node platform/pages/check.mjs dist                # check the artifact
node --test platform/pages/build.test.mjs platform/pages/check.test.mjs
```

Then serve it and click around:

```
cd platform/pages/dist && python3 -m http.server 8899
```

## Why this exists

GitHub serves **one** Pages site per repository. Before this, the only workflow
that could publish one built `retail-pilot-intel`'s passcode-gated docs app — so
the owner's single `GITHUB_PAGES_ENABLED` flip would have put an internal docs
site live and left every finished calculator with no public URL at all.

`portfolio/DIRECTION.md` says deploy beats another build until a stranger can
reach something. That means the site the flip publishes has to *be* the
products. This is that site: 33 tools at the time of writing, each already
built, tested, and free.

## What gets published

Automatic, not a manifest. A calculator lands on `main` here most days, and a
hand-maintained list would be stale within a week — the new tool would silently
never be reachable. Any venture that grows a browser entry point is published on
the next push to `main`.

A venture is discovered when it has:

| Path | Published at |
|---|---|
| `ventures/<slug>/index.html` | `/<slug>/` |
| `ventures/<slug>/site/index.html` | `/<slug>/` |
| an entry in `ENTRY_OVERRIDES` | `/<slug>/` |

**To keep a venture off the public site**, add its slug to `EXCLUDED_SLUGS` in
`build.mjs` with a comment saying why. Two are excluded today: the agent box
(`portfolio/hosting/README.md` keeps it off the public path) and
`retail-pilot-intel` (passcode-gated internal docs that need a pnpm build and
keep their own workflow).

Not shipped to visitors: `*.test.mjs`, CLI source (`.py`, `.toml`, …),
`VENTURE.yaml`, `README.md`, per-venture `robots.txt` (only the one at the
origin root is read), and `node_modules`. `LICENSE` files are kept.

## What the build fixes up

- **The placeholder origin.** Every venture's `sitemap.xml` and canonical tags
  were written against `https://example.invalid/<slug>/`, because no real origin
  existed. The build rewrites that to the real base URL, so SEO already written
  points at a page that resolves.
- **Links that escape the site.** Several pages link to a file beside the
  venture (`../README.md`) or to CLI source this build does not publish. Under a
  shared origin those become 404s, so the build repoints them at the file in the
  public repository, where the link still answers the question it was there to
  answer. Links that resolve inside the site are left untouched. The build
  prints how many it repointed.
- **Crawlability.** A root `robots.txt`, a `sitemap.xml` index covering the hub
  and every venture, a `404.html`, and `.nojekyll` (without which Pages silently
  drops any directory starting with `_`).
- **The sitemaps themselves.** Each venture's `sitemap.xml` is *regenerated*
  from the pages that actually published, replacing the hand-written one. The
  ventures' own were copied verbatim until 2026-08-26, and three things were
  wrong with them at once: some listed relative `<loc>` values, which the
  sitemaps protocol does not allow and crawlers reject; two were written
  against `…/monorepo-projects/ventures/<slug>/`, a path this site does not
  serve, so all 11 of their URLs were 404s; and most were simply stale, leaving
  70 of 186 pages in no sitemap at all. Generating from the output makes all
  three impossible: a page is listed because it shipped, at the URL it shipped
  to. Nobody has to remember to update a sitemap again.
- **Dead ends.** Every venture page was written as a standalone site, so none of
  them linked to any other. The hub linked down into 33 tools and nothing linked
  back or across: someone arriving from a search result at
  `does-subscribe-and-save-still-pay.html` saw one calculator and had no route to
  the other 32. The build injects a bar at the top of every published page ("←
  All N free tools") and a footer offering four sibling tools — same category
  first — plus the hub and the optional sponsor link.

  It is injected at build time rather than committed into each venture for two
  reasons. A calculator lands on `main` most days and injection covers each new
  one for free. And venture pages are edited concurrently by other sessions, so
  a nav bar written into ~180 product files would conflict with nearly every
  open branch. Markup is scoped under `.pf-chrome` so it cannot restyle a
  venture's page, and the pass is idempotent.

## Offline and installable

The people these tools are for are often somewhere with no signal at the moment
they need the number: a contractor measuring in a crawl space, a seller in a
warehouse aisle, a driver at a dock. Every tool is already pure client-side
arithmetic, so the only thing between that user and an answer is fetching the
page — which is what `offline.mjs` removes.

The build emits a service worker, a web app manifest, PNG icons, and an
`offline.html` fallback, and wires every published page to them. Two behaviours:

1. **Anything opened once opens again offline**, automatically, including its
   modules — the worker caches each same-origin GET as it is served.
2. **"Save all tools for offline"** on the hub fetches every tool's entry page
   and modules up front (~3 MB), for someone who knows they are about to lose
   signal. It is a button, never automatic: nobody's mobile data gets spent
   without them asking.

A page not saved and not previously opened falls back to `offline.html`, which
says so plainly and links back to the hub.

**Staleness is bounded by construction.** The cache name carries a SHA-256 of
the built site, so a deploy lands in a *new* cache and `activate` deletes every
older one. A visitor is at most one navigation behind and never mixes files from
two builds. The worker itself is never served from cache, so the browser's
update check always sees the real file.

Registration is progressive enhancement: with no service worker support, or a
rejected registration (private mode), every page behaves exactly as before, and
the offline widget stays hidden rather than appearing and failing.

Nothing about this sends anything anywhere. The worker only touches same-origin
GETs; the hub's counting is still `localStorage`-only.

## The availability clause

`PRODUCT_PLAYBOOK.md` §5b requires the no-warranty *and* the no-SLA clause on
every hosted surface. Most ventures write both in their own voice; a few were
authored when nothing here was hosted, so the availability half was moot. It
stops being moot the moment the Pages variable is flipped, so the chrome pass
supplies the clause on any page still missing one — matched loosely, so a
venture that words it its own way is left alone and never given a second,
differently-worded statement. A page added tomorrow cannot ship without it.

## Checking the artifact

`check.mjs` runs over the built directory, not the sources, because that is
where these defects are created — by the copy, not by the input. It fails the
build on a missing root file, a leftover `example.invalid`, a relative link
that resolves to nothing, a link that climbs out of the site root, a product
directory with no landing page, a page in no sitemap, and a sitemap URL that
did not ship. It follows the sitemap index into each venture's sitemap; a check
that read only the root would have passed while every defect above sat one
level down.

The workflow runs it between building and uploading, so a broken artifact never
reaches the live site.

## Driving the customer journey

`check.mjs` proves the files are right. It cannot prove the site *works* — that
search filters, that the opt-out actually stops counting, that a calculator
computes rather than just paints, that nothing throws in the console.
`journey.mjs` drives that in a real browser:

```bash
node platform/pages/build.mjs --out=dist
python3 -m http.server 8793 --directory dist &
node platform/pages/journey.mjs

# or against the live site, once publishing is on:
BASE_URL=https://duncan-haywood.github.io/monorepo-projects node platform/pages/journey.mjs
```

It covers the hub and its grouping, search (narrowing, the empty state, and
clearing), the usage opt-out across a reload, a click through into a calculator
and a computed figure, a cross-product sibling link, a nested product hub,
sitemap sampling, the 404, and a 375px viewport for horizontal overflow.

Counts are derived from the page, never hardcoded — a venture lands most days,
and a literal would fail on a healthy site the moment someone ships a
calculator.

It is deliberately **not** in CI: it needs Playwright, which is not a dependency
of this repo, and `build.test.mjs` plus `check.mjs` already gate the build. Run
it before claiming the site works, and again against production after the owner
flip. If Playwright is installed globally rather than beside the repo, point
`PLAYWRIGHT` at its module path.

## Deploying

`.github/workflows/portfolio-pages.yml` builds and tests on every push to `main`
and every pull request that touches `ventures/` or this directory, so a broken
site is caught at merge time whether or not publishing is on.

Publishing is gated on an owner-set repository variable:

| Setting | Where | Value |
|---|---|---|
| Pages source | Settings → Pages | **GitHub Actions** |
| `GITHUB_PAGES_ENABLED` | Settings → Variables → Actions | `true` |
| `PAGES_BASE_URL` *(optional)* | Settings → Variables → Actions | a custom domain, with trailing slash |

That is the `deploy-settings` flip already in the owner decision queue. It is
not a second ask — this workflow is what it now publishes.

Until it is set, the `deploy` job is skipped and the `build` job still runs, so
the artifact is always proven buildable. `actions/deploy-pages` 404s while Pages
is off, which is why the gate exists rather than letting every merge go red.

The gate also requires `github.ref == 'refs/heads/main'`. `workflow_dispatch`
can be run against any branch, and publishing the live site from a feature
branch is not a mistake anyone would notice quickly.

After deploying, the workflow fetches the real public URL — the front page,
both sitemaps, `robots.txt`, and one product — and fails if any of them does not
return 200, or if `sitemap.xml` comes back without a sitemap index. A completed
deploy step is not evidence that anything serves; this makes "deployed" a fact
rather than an inference.

Only one workflow may publish to Pages. `retail-pilot-intel-deploy-docs.yml`
reads `RETAIL_PILOT_INTEL_PAGES` instead, so an owner who wants those docs on
the origin makes that choice explicitly rather than having two deployments race.

The same applied to `pages.yml`, a **second portfolio site** built independently
the same hour (`platform/ci/build_pages_site.py`), which deployed on the same
`GITHUB_PAGES_ENABLED` flip from a different concurrency group — so the flip
would have armed two publishers of two different builds for the one origin. That
is resolved on `main`: `pages.yml` no longer deploys, it still builds and checks
its artifact as an independent second opinion on what `ventures/` contains, and
`publish_surface.py --check` now fails if one variable would ever arm two Pages
deployments again.

## Rollback

The site is rebuilt from `main` on every push and holds no state — no database,
no user data, nothing to migrate. To roll back, revert the offending commit and
let the workflow republish, or re-run an earlier successful run of
`Portfolio Pages` from the Actions tab. To take the site down entirely, set
`GITHUB_PAGES_ENABLED` to anything other than `true`.

**Rolling back the service worker needs its own lever.** A worker lives on the
visitor's device and keeps answering there, so reverting the commit does not
take it back — and taking the site down leaves each visitor on their last cached
copy. Build with `PAGES_DISABLE_SW=1` and deploy: the published `sw.js` is then
one whose only job is to delete every cache, unregister itself, and reload the
page. Each visitor is cleaned up on their next visit.

```
PAGES_DISABLE_SW=1 node platform/pages/build.mjs --out=dist
```

## Privacy and terms

Every published tool runs entirely in the visitor's browser; nothing they type
is uploaded, because there is no server that could receive it. The hub counts
anonymous aggregate events (a visit, which tool slugs were opened) in the
visitor's own `localStorage`, with an in-page opt-out, and counts nothing at all
when the browser sends Do Not Track or Global Privacy Control.

The injected chrome counts on the same terms and under the same key and opt-out:
`tool_viewed:<slug>` when a page loads and `cross_tool_click:<slug>` when a
visitor follows the nav. Until then the hub was the only page that counted
anything, so a visitor arriving from search straight at a deep SEO page — the
traffic those pages exist for — was invisible. Nothing is transmitted: there is
no `fetch`, no beacon, and the counts never leave the device.

The offline cache is the visitor's own browser storage: pages and scripts this
site served them, held on their device, cleared by clearing site data. No
personal data is stored, and nothing cached is ever sent anywhere.

The hub carries the no-warranty and no-SLA copy from `PRODUCT_PLAYBOOK.md` §5b,
required on every hosted surface, plus an optional GitHub Sponsors link that
gates nothing.
