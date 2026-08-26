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
- **Crawlability.** A root `robots.txt`, a `sitemap.xml` index covering the hub
  and every venture's own sitemap, a `404.html`, and `.nojekyll` (without which
  Pages silently drops any directory starting with `_`).
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

The injected chrome counts on the same terms and under the same key and opt-out:
`tool_viewed:<slug>` when a page loads and `cross_tool_click:<slug>` when a
visitor follows the nav. Until then the hub was the only page that counted
anything, so a visitor arriving from search straight at a deep SEO page — the
traffic those pages exist for — was invisible. Nothing is transmitted: there is
no `fetch`, no beacon, and the counts never leave the device.

The hub carries the no-warranty and no-SLA copy from `PRODUCT_PLAYBOOK.md` §5b,
required on every hosted surface, plus an optional GitHub Sponsors link that
gates nothing.
