# Portfolio Pages

The public site. `build.mjs` assembles every static, browser-runnable venture
surface in this repository into one GitHub Pages deployment, behind a hub page
that lists and searches them.

```
node platform/pages/build.mjs --out=dist          # build
node --test platform/pages/build.test.mjs         # test
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
- **Relative sitemap entries.** Half the ventures wrote `<loc>index.html</loc>`
  or `<loc>./</loc>`, because each was authored as if its own folder were the
  site root. The sitemaps protocol requires a fully-qualified URL and discards
  anything else, so those pages would have shipped to crawlers as invalid
  entries and never been indexed. The build resolves them against the venture's
  published address. Absolute entries are left exactly as written.
- **The production origin, when it is not the origin.** Three ventures wrote
  today's `duncan-haywood.github.io` address directly instead of the
  placeholder. That is correct only while the site is served from that exact
  URL; `PAGES_BASE_URL` exists so a custom domain can be attached. The build
  treats the default as a second placeholder, so the whole portfolio follows
  the base URL it is actually built with.
- **Crawlability.** A root `robots.txt`, a `sitemap.xml` index covering the hub
  and every venture's own sitemap, a `404.html`, and `.nojekyll` (without which
  Pages silently drops any directory starting with `_`).

## Checking the artifact

`build.test.mjs` tests the builder's functions against fixtures.
`check_site.mjs` tests the **output** — the tree that is about to become the
public site. The two fail in different ways: a builder can pass every unit test
and still emit a sitemap entry with no page behind it.

```
node build.mjs --out=dist
node check_site.mjs dist
```

It fails the build on a dead internal link, a link that escapes the site root,
a sitemap entry that is relative, cross-origin, or resolves to nothing, a
canonical left on a placeholder origin, or a missing `index.html` / `404.html` /
`robots.txt` / `sitemap.xml`. Placeholder hosts are only flagged in canonical
tags, `og:url`, and sitemap entries — never in page text, because several tools
legitimately display `https://example.com` inside sample payloads.

`journey.mjs` drives the primary customer journey through a real browser. It is
not in CI (Playwright is not a dependency here); it is what you run before
claiming the site works, and against `BASE_URL` after the flip:

```
node build.mjs --out=dist
python3 -m http.server 8792 --directory dist &
node journey.mjs
BASE_URL=https://duncan-haywood.github.io/monorepo-projects node journey.mjs
```

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

The deploy job also checks `github.ref == 'refs/heads/main'`. `workflow_dispatch`
can be run from any branch, and without that guard a dispatch from a feature
branch would publish that branch's build to the one live site.

After `deploy-pages` reports success, the job curls the real public URL — the
directory, `sitemap.xml`, `robots.txt`, `404.html`, and two individual tools —
and fails if any of them does not answer `200` with our content. A completed
deploy step is not evidence that anything is reachable, and this is the only
check in the pipeline that touches the public origin over the network.

Only one workflow may publish to Pages. `retail-pilot-intel-deploy-docs.yml`
reads `RETAIL_PILOT_INTEL_PAGES` instead, so an owner who wants those docs on
the origin makes that choice explicitly rather than having two deployments race.

## Rollback

The site is rebuilt from `main` on every push and holds no state — no database,
no user data, nothing to migrate. To roll back, revert the offending commit and
let the workflow republish, or re-run an earlier successful run of
`Portfolio Pages` from the Actions tab. To take the site down entirely, set
`GITHUB_PAGES_ENABLED` to anything other than `true`.

## Privacy and terms

Every published tool runs entirely in the visitor's browser; nothing they type
is uploaded, because there is no server that could receive it. The hub counts
anonymous aggregate events (a visit, which tool slugs were opened) in the
visitor's own `localStorage`, with an in-page opt-out, and counts nothing at all
when the browser sends Do Not Track or Global Privacy Control.

The hub carries the no-warranty and no-SLA copy from `PRODUCT_PLAYBOOK.md` §5b,
required on every hosted surface, plus an optional GitHub Sponsors link that
gates nothing.
