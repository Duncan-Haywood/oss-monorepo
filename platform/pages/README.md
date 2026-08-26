# Portfolio Pages

The public site. `build.mjs` assembles every static, browser-runnable venture
surface in this repository into one GitHub Pages deployment, behind a hub page
that lists and searches them.

```
node platform/pages/build.mjs --out=dist                        # build
node platform/pages/check.mjs --dist=dist                       # verify the output
node --test platform/pages/build.test.mjs platform/pages/check.test.mjs
node platform/pages/journey.mjs --dist=dist                     # drive it in a browser
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

## What is checked before it can publish

`build.test.mjs` tests the builder's functions. `check.mjs` tests the site the
builder *emitted*, and the workflow will not upload an artifact that fails it.

Those are different jobs, and the second one is the one that protects visitors.
Discovery is automatic by design, so a venture reaches this artifact without
anyone having looked at it — and the owner's `GITHUB_PAGES_ENABLED` flip
publishes whatever the last build left behind. A defect that arrives from
outside the builder therefore does not fail loudly at deploy time. It goes live.

`check.mjs` reads the built tree (no network, no browser) and fails on:

| Check | The failure it prevents |
|---|---|
| Root `index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `sitemap-hub.xml` | A site with no front page or no crawlable entry |
| Every tool directory has an `index.html` | A slug linked from the hub that 404s |
| Hub links and published directories agree, both ways | A tool that built fine and is simply unreachable |
| At least 20 tools published | A discovery collapse that emits a valid-looking hub with three tools and stays green |
| Every local `src`/`href` and every ES-module specifier resolves | A calculator whose `calc.mjs` was filtered out: the form renders, then does nothing |
| No reference escapes the site root | A link that only worked on the author's disk |
| No `example.invalid` anywhere | Canonical tags and sitemaps pointing at a domain that does not resolve |
| Every tool page and the hub carry the no-warranty disclaimer | Money figures shipped with no limitation of liability |
| No `*.test.mjs`, `VENTURE.yaml`, `README.md`, `node_modules` | Test payload and bookkeeping served to visitors |
| Every `sitemap.xml` entry has a page behind it | Crawlers led to 404s |

`check.test.mjs` builds a deliberately broken site per check and asserts that
check fires, plus one well-formed site that must stay clean — a verifier that
only ever passes is worse than none, because it buys false confidence in the one
artifact that reaches the public.

### The browser half

`check.mjs` can prove a page exists and its links resolve. It cannot prove the
calculator *computes* — a tool whose module throws on load passes every static
check and is still useless.

`journey.mjs` is that pass: it serves the built site, then drives Chromium
through the real journey (hub loads → search narrows → open a tool → change an
input → the figures move), and fails if a driven calculator does not recompute
or the browser raises anything. Because every tool here ships worked-example
defaults, it asserts the output *changes*, not merely that a dollar sign is
present.

Playwright is not a dependency of this repo, so `journey.mjs` exits 0 with a
`SKIP` line where no browser is available, and is not a CI gate. Run it before a
publish. Last run: 34 tools on the hub, search narrowed 34→3, and
`ebay-fee-calculator`, `invoice-payment-terms-calculator`,
`amazon-fba-calculator` and `janitorial-bid-calculator` each recomputed with no
console errors.

## Deploying

`.github/workflows/portfolio-pages.yml` builds, tests, and checks on every push
to `main` and every pull request that touches `ventures/` or this directory, so
a broken site is caught at merge time whether or not publishing is on.

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

The hub carries the no-warranty and no-SLA copy from `PRODUCT_PLAYBOOK.md` §5b,
required on every hosted surface, plus an optional GitHub Sponsors link that
gates nothing.
