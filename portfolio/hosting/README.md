# Hosting

**Decided 2026-08-25.** This is the portfolio's default host. When other
docs still mention Cloudflare or Vercel as a menu, this file wins.

The portfolio already pays for two Hetzner boxes and already has SSH keys
in GitHub Actions secrets. Do not add a third cloud to host a calculator.

## Split

| Surface | Host | Why |
|---|---|---|
| Browser calculators, SEO landings, most docs | **GitHub Pages** | $0, no box to patch, no user data on our disk. Custom domain is registrar A/CNAME to GitHub — no Cloudflare. |
| Anything with a process, disk, or webhook | **Hetzner product box** | Incremental cost is ~0. Deploy with the existing GHA SSH keys (Caddy + compose/systemd, or the OpenTofu/Argo path in flight on #1486). |
| Headless agent fleet | **Hetzner agent box** | `ventures/ubuntu-agent-server`. Keep this off the public product path. |

Do not put public sites on the agent box. Do not put a static calculator on
Hetzner just because the box is there.

## What we are not adding

- **Cloudflare** (Pages, Workers, Access) is not a portfolio default. Gated
  workflows that already mention it stay unused.
- **Vercel / Railway** are not a portfolio default. Same: existing optional
  jobs stay gated.
- A new vendor account for product hosting. The Hetzner account exists.

`local-site-studio` stays on Convex for its backend. Hosting its frontend
on Pages or the product box is fine; replacing Convex is a rewrite.

## Terms users see

Hosted surfaces use the no-warranty **and** no-SLA copy in
[`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md) §5b. That covers
uptime and “the URL went away.” It does not cover storing personal data
on the box — keep user data off Hetzner unless the product cannot work
without it, and say so in the privacy line.

## What a session does

1. Prefer a static/browser shape so the product can live on GitHub Pages.
2. If it needs a process, target the Hetzner product box and keep it
   stateless. Include the no-SLA clause.
3. Nothing. The Pages artifact builds itself — see below. A static product
   is picked up automatically the moment it has an `index.html`.
4. Do not register Cloudflare, Vercel, or another host as the way a
   product goes live.

## The Pages artifact builds itself

`.github/workflows/portfolio-pages.yml` runs `platform/pages/build.mjs` on every
push to `main`. The builder finds every venture with an `index.html` (at the
venture root, or under `site/`), copies its web assets to `dist/<slug>/`, and
generates the hub at `dist/index.html` that links all of them, plus
`sitemap.xml`, `catalog.json`, `robots.txt`, and `404.html`. It then injects
the cross-tool navigation and checks the artifact (`platform/pages/check.mjs`)
before anything is uploaded.

**A new static product needs no deploy work at all.** Give it an `index.html`
and it appears on the hub on merge. There is nothing to register.

### Exactly one workflow deploys

`portfolio-pages.yml` is the only workflow that calls `actions/deploy-pages` for
the portfolio site, and that is a rule rather than an accident. GitHub serves one
Pages site per repository and `actions/deploy-pages` replaces the whole of it, so
two workflows armed by the same owner flip do not publish twice — they race, and
the live site is whichever finished last.

That happened on 2026-08-26: `pages.yml` and `portfolio-pages.yml` were written
within the hour from the same reasoning, neither pull request could see the
other, and both merged deploying under `GITHUB_PAGES_ENABLED`.

`.github/workflows/pages.yml` still exists and still runs
`platform/ci/build_pages_site.py`, but **it no longer deploys**. It is kept as an
independent second implementation of the same site: when the two builders
disagree about what `ventures/` contains, one of them has a bug. Read its header
before changing it.

`publish_surface.py --check` fails if any single variable would arm two Pages
deployments, so this cannot come back silently. A workflow gated on its *own*
owner variable is still fine — that is how `retail-pilot-intel-deploy-docs.yml`
coexists, reading `RETAIL_PILOT_INTEL_PAGES` so the portfolio flip does not
publish it.

Two things the builder owns, so no venture should hand-maintain them:

- **The public base URL.** Ventures used to hard-code a guessed origin —
  most said `https://example.invalid/<slug>/`, four said
  `.../monorepo-projects/ventures/<slug>/`. The build rewrites every `<loc>`
  and `Sitemap:` line to where it actually deploys. Do not hand-edit a
  sitemap to "fix" its domain; it will be rewritten anyway.
- **Where a product lives.** The layout is `<base>/<slug>/`. Products are not
  nested under `/ventures/`.

Run it locally before assuming anything about the live site:

```
node platform/pages/build.mjs --out=dist         # build what actually deploys
node platform/pages/check.mjs dist               # dead links, stale origins, sitemaps
node --test platform/pages/build.test.mjs        # test the builder
python3 -m http.server -d dist 8000              # then open localhost:8000
```

The second builder, if you are checking the two against each other:

```
python3 platform/ci/build_pages_site.py          # build into _site/
python3 platform/ci/check_pages_links.py _site   # fail on any link that 404s
```

The remaining owner flip is still `deploy-settings` — enable GitHub Pages
(`GITHUB_PAGES_ENABLED=true`, Pages source: GitHub Actions). Do not open a
second platform ask. Until that variable is set, the build still runs on
every push and the artifact is still uploaded; only the publish step is
skipped. Flipping it publishes everything at once.
