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

## Amended 2026-08-29: the whole static site also goes to Hetzner

The row above still holds for a *single* calculator. It stopped holding for
the **assembled portfolio site**, which now also deploys to the Hetzner
control-plane box via `gitops/prod/portfolio-site.yaml`, on
`tools.marisstella.dev`.

The GitHub Pages route was decided when it looked like one owner flip away.
It is not:

- **Pages is not enabled**, and enabling it is the queued `deploy-settings`
  ask — still open.
- **The repository is private.** Pages from a private repository does not
  serve a public site on the free tier, so the flip alone would not have
  put these tools in front of strangers. This was not accounted for when
  the row above was written.
- **Nothing is building the artifact — again, as of 2026-09-04.** This
  entry read "~~Resolved 2026-09-01~~ ... treat this as 'not currently
  blocking'" until 2026-09-05, and that is exactly how long it was wrong
  for. The 2026-08-26 starvation did lift on its own at 2026-09-01T00:00:53Z,
  which is what a metered allowance resetting looks like; it then recurred
  on 2026-09-04 at ~22:39Z when the allowance was spent again. Measured
  2026-09-05: run 33932676830 came back `runner_id: 0` with no steps and
  `python3 platform/ci/ci_starvation.py --run 33932676830` exits 1. So
  `portfolio-pages.yml` produces no deployable artifact today, and
  `deploy-settings` cannot complete while that holds — which is why
  `decision_queue.py` sinks it. Re-measure rather than trusting this
  paragraph; it is the second time this exact line has gone stale.

**So three blockers remain, not two**, and the third is the one that keeps
moving. Note also that the first two are not equivalent: enabling Pages is a
flip the owner controls, but **the private-repo constraint above is a plan
question, not a settings question** — if this account is on the free tier,
`deploy-settings` is not a route to a public surface at all, however green
CI gets. Nothing in this repository can read the account's plan, so that
stays unresolved here rather than assumed either way.

The Hetzner path shares none of the three: Argo syncs the
manifest from `main` and the site is built inside the cluster, so it needs
neither Actions nor Pages. The box is already paid for and already runs
ingress-nginx and cert-manager. Its own remaining step is now **one**: a
sealed read-only clone token, listed in `gitops/README.md`.

## Amended 2026-09-02: the apex serves without waiting for that seal

`gitops/prod/portfolio-front.yaml` puts a generated front-door page on
`marisstella.dev` and `www.marisstella.dev`, served by nginx from a
kustomize ConfigMap. It clones nothing at pod start, so it needs no token;
Argo applies it from `main`, so it needs no Actions run and no Pages flip.
That makes it the portfolio's first surface a stranger can actually reach,
and it went up on a merge with no owner action.

This does not replace the row above, but it does reduce what the seal is still
for. **Corrected 2026-09-03:** this paragraph used to say "the front door is one
page describing the collection, and every category card on it links into
`tools.marisstella.dev`. The seal is still what puts 169 tools in front of
anyone." Neither half is true, and a session reading it mis-ranks its whole run
— the same correction `CLAUDE.md` already carries.

- The apex **serves the 174 tools itself**, at `/tools/<slug>/`, from the
  mirror in `gitops/prod/front-door-tools/`. The seal buys no tool a stranger
  cannot already reach.
- The category cards link to `https://marisstella.dev/c/<id>/` — seven browse
  pages this host renders and serves. They pointed at the dark host once; they
  have not since the cards were fixed, and since 2026-09-03 they point at real
  pages rather than at fragments.

What the seal still buys is the canonical hostname and indexability under it.
Worth doing, and not the difference between a dead end and a product. The DNS record
turned out to already exist (the wildcard `A/*` on `marisstella.dev` covers
the subdomain, verified 2026-08-29), and the ACME contact stopped being a
step on 2026-08-30 — an ACME account contact is optional, so the issuers
ship without one rather than with a placeholder nobody could act on.

This is an addition, not a replacement. If Pages is later enabled and the
runners come back, the same `build.mjs` output serves both; `PAGES_BASE_URL`
is the only thing that differs, and each route stamps its own canonical
URLs. Publish through one of them at a time so the two do not compete in
search results for the same pages.

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
other, and both merged deploying under the same owner-set variable — spelled
`GITHUB_PAGES_ENABLED` at the time, since renamed to `PAGES_ENABLED` (see
below): GitHub rejects any Actions configuration-variable name starting with
`GITHUB_`, so the original spelling could never actually have been set.

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
(`PAGES_ENABLED=true`, Pages source: GitHub Actions). Do not open a
second platform ask. Until that variable is set, the build still runs on
every push and the artifact is still uploaded; only the publish step is
skipped. Flipping it publishes everything at once.

**Not `GITHUB_PAGES_ENABLED`, which this section named until it was found
to be unsettable.** GitHub rejects any Actions configuration-variable name
starting with `GITHUB_` (case-insensitive) at creation time — reserved for
GitHub's own use, per
[the naming rules](https://docs.github.com/en/actions/learn-github-actions/variables#naming-conventions-for-configuration-variables)
— so the owner could never have set it through Settings → Variables →
Actions, and `.github/workflows/portfolio-pages.yml`'s `deploy` job would
have stayed permanently skipped. The variable is `PAGES_ENABLED` now; the
workflow, `platform/ci/publish_surface.py`, and the decision queue all read
that name.
