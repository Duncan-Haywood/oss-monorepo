# Hosting

What is served, how a product gets served, and what two months of hosting
mistakes taught. The full dated story (the 2026-08-25 decision, the Hetzner
and k3s route, the branch route and nine amendments) is kept verbatim in
[`docs/history/hosting-2026-08-25-to-10-24.md`](../../docs/history/hosting-2026-08-25-to-10-24.md).
Read it for study; nothing in it is current instruction.

## What is served now

- **The catalogue is served by Cloudflare** at **https://marisstella.app/**
  (owner, 2026-10-29: "we are moving from ghp to cloudflare"; the domain was
  added to the Cloudflare account on 2026-10-30). The first address,
  https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/, forwards
  to it since 2026-10-31: a `Refresh` header on static files, a 301 on the
  paths the router runs for (`platform/pages/cloudflare/README.md`). Two free-plan
  Workers serve it as static files, because one free Worker holds at most
  20,000 files and the site is past that: `platform/pages/cloudflare/README.md`.
  `.github/workflows/portfolio-pages.yml` builds for that origin and deploys
  on every merge and every three hours. `vars.PAGES_ENABLED=false` pauses it;
  `vars.PAGES_BASE_URL` overrides the origin the build names.
- **GitHub Pages now serves redirect pages.** The old address,
  https://duncan-haywood.github.io/oss-monorepo/, carries one page per old
  URL with a canonical link, a zero-second refresh and a script redirect to
  the same path on Cloudflare (`platform/pages/redirect-stubs.mjs`); feeds,
  sitemaps and JSON are copied unchanged. GitHub Pages cannot send a real
  301. The redirect deploy runs only after the Cloudflare deploy has
  published and answered. Without the Cloudflare secrets the workflow falls
  back to serving the full site on GitHub Pages, as before.
- **The Hetzner boxes, the k3s cluster and Argo CD were deleted on
  2026-10-01.** That route is retired, not down. Its trees (`infra/`,
  `bootstrap/`, `gitops/`) and the `marisstella.dev` front-door generators
  were deleted on 2026-10-30; `git log --diff-filter=D -- gitops/` finds
  them. Its old IP addresses may now belong to a stranger, so nothing should
  connect to them.
- **`marisstella.dev` resolves to nothing.** Checked 2026-10-30: it is still
  registered and delegated to Hetzner's DNS servers, which refuse queries for
  it (the zone went with the servers), so the released-IP takeover risk in
  `asks.yaml`'s `pages-custom-domain` row is gone. The site's domain is
  `marisstella.app` instead (above).
- **Readers that are known to be stale.** `pages_state.py`'s "source" and
  "snapshot" lines still describe the retired `gh-pages` branch route.
  `indexnow_state.py` reads `portfolio-pages.yml`'s deploy runs and is
  current. No session can fetch `github.io` (the egress proxy returns 403),
  so `github-pages-origin` in `portfolio/ledger/infra_state.yaml` stays
  `unknown` until the owner loads the site logged out.

## How a product gets served

**Pick the form the product's users need** (`PRODUCT_PLAYBOOK.md` §2). There
is no static-only rule (owner, 2026-10-21). A web surface, if it has one,
lives on the site (Cloudflare since 2026-10-29). A product that needs a process, disk or webhook ships
for its users or deployers to run (container image, self-deploy, local
package). Hosting it on a bill of the owner's needs the owner, because that
spends money and opens an account (`goals.md`, "Guardrails").

**A static product needs no deploy work.** `platform/pages/build.mjs` finds
every venture with an `index.html` (at the venture root or under `site/`),
copies it to `dist/<slug>/`, generates the hub, `sitemap.xml`,
`catalog.json`, `robots.txt` and `404.html`, injects the shared navigation,
and checks the artifact (`platform/pages/check.mjs`) before upload. The
product appears on the hub on merge.

The builder owns two things, so a venture gains nothing by hand-maintaining
them:

- **The public base URL.** The build rewrites every sitemap `<loc>` and
  `Sitemap:` line to where it actually deploys.
- **Where a product lives:** `<base>/<slug>/`, not nested under
  `/ventures/`.

Check the build locally before assuming anything about the live site:

```
node platform/pages/build.mjs --out=dist         # build what actually deploys
node platform/pages/check.mjs dist               # dead links, stale origins, sitemaps
node --test platform/pages/build.test.mjs        # test the builder
python3 -m http.server -d dist 8000              # then open localhost:8000
```

`.github/workflows/pages.yml` runs a second, independent builder
(`platform/ci/build_pages_site.py`) that does not deploy. When the two
disagree about what `ventures/` contains, one of them has a bug:

```
python3 platform/ci/build_pages_site.py          # build into _site/
python3 platform/ci/check_pages_links.py _site   # fail on any link that 404s
```

**Other hosts.** The site moved from GitHub Pages to Cloudflare's free plan
on 2026-10-29 at the owner's request. The free plan cannot bill: going over
a limit fails requests rather than charging. Vercel and Railway are still not
defaults, and a product that needs a backend should state the need.
`local-site-studio` keeps Convex for its backend; replacing it would be a
rewrite.

**Terms users see.** Hosted surfaces carry the no-warranty and no-SLA copy
in [`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md) §5b; the Pages build
injects it. That copy covers uptime and "the URL went away". It does not
cover storing personal data, so a product that must store any says so in its
privacy line.

## Lessons from the hosting history

Each is one line of what happened and what it suggests. The evidence is in
the history file.

- **One workflow deploys Pages.** On 2026-08-26 `pages.yml` and
  `portfolio-pages.yml` were written within the hour from the same reasoning,
  both merged deploying under one owner variable, and they raced:
  `actions/deploy-pages` replaces the whole site, so the live site was
  whichever finished last. `publish_surface.py --check` now fails if one
  variable would arm two deployments. A workflow gated on its own variable
  (as `retail-pilot-intel-deploy-docs.yml` is, on `RETAIL_PILOT_INTEL_PAGES`)
  is fine.
- **Variable names starting with `GITHUB_` cannot be set.** The deploy gate
  was first called `GITHUB_PAGES_ENABLED`; GitHub rejects that prefix, so the
  owner could never have set it and the deploy job stayed skipped for weeks.
  It is `PAGES_ENABLED` now. An opt-in gate nobody can or does set looks
  exactly like a working one that is switched off.
- **A force-pushed publish branch deletes what the build did not make.**
  `publish-branch.sh` built an orphan commit, which would have silently
  dropped the `CNAME` file that holds a custom domain, with every check
  green. The script now carries the file forward.
  Ask what a publisher deletes, not only what it writes.
- **Prefer a reading from something present** (a run id, a status code, a
  dated measurement) over reasoning from manifests or from an absence. This
  file once told runs for days that the catalogue was live while nothing
  listened on port 443, and later that it was dark while Pages served it.
  Two of its paragraphs went stale the same way twice.
- **A copied list goes stale; an import does not.** The retired front-door
  mirror once restated `build.mjs`'s entry-point rules and lost live products
  twice, until it imported `ENTRY_OVERRIDES` from the builder.
- **Amendments stacked on a reference doc hide the current state.** By
  2026-10-24 this file carried nine dated amendments and corrections, the
  newest at the bottom, and a run had to read 360 lines to learn which host
  was live. Rewrite the state in place and move the story to `docs/history/`.
