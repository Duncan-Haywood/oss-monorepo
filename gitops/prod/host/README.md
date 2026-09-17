# Portfolio site, host mode

The catalogue served by the Hetzner box's own **nginx and systemd**, instead of
by Argo CD and the k3s Ingress. Same artifact, same checks, same headers —
different place to stand.

## Why this exists

This repository has ~175 finished products. `marisstella.dev`, the
portfolio's own name, shows every visitor a refused connection, and two of
the three routes that would serve it are down *because they were built on top
of each other*:

| route | state | why |
|---|---|---|
| Argo CD on k3s ([`gitops/prod`](../)) | down | `:6443` refused on both boxes — [`Outage triage`](../../../.github/workflows/outage-triage.yml) run 33889983086 |
| GitHub Pages, Actions source ([`portfolio-pages.yml`](../../../.github/workflows/portfolio-pages.yml)) | down | needs an Actions runner; metered minutes exhausted |
| self-hosted runners ([`gitops/ci/`](../../ci/README.md)) | down | they run **as pods in that same k3s** |

**Corrected 2026-09-06.** This table used to open with "no way for a stranger
to open any of them", written before the `gh-pages` *branch* route — a fourth
path, distinct from the `portfolio-pages.yml` row above, and not downstream of
a runner — was confirmed live the same day: `python3 platform/ci/pages_state.py`
shows GitHub's own managed builder deploying that branch, so the catalogue is
reachable today at `https://duncan-haywood.github.io/monorepo-projects/`. What
the table still describes correctly is `marisstella.dev` itself: none of its
three routes serve it, so the portfolio's *own name* still refuses every
connection even though the catalogue has a public URL elsewhere. See
`portfolio/hosting/README.md`'s "Amended 2026-09-06" section for the fuller
picture, and do not read this file as saying the catalogue is unreachable.

[`gitops/agents/host/`](../../agents/host/README.md) and
[`gitops/ci/host/`](../../ci/host/README.md) already answer this for the two
things that *build* — put them on the box's own systemd, where neither k3s nor
an Actions runner is in the way. Both of their READMEs note the boxes
themselves were up the whole time: `:22` answers on both.

Nothing had yet done the same for the thing that **serves `marisstella.dev`
itself**. So the repository could restore its dev capacity and its CI onto a
box that still showed a stranger a refused connection at the portfolio's own
name — while a stranger could already reach the catalogue at the github.io
URL above. This closes the `marisstella.dev` gap, and it is the only one of
the three whose completion a user *visiting that domain* can see.

## What it serves

Exactly what [`platform/pages/build.mjs`](../../../platform/pages/build.mjs)
produces — the same artifact `publish-branch.sh` commits to `gh-pages` and the
Pages workflow deploys. 175 tools, 720 pages, the category and comparison
pages, `sitemap.xml`, `robots.txt`, `llms.txt` and the `/feed.xml` Atom feed.
Nothing here is a second copy of the site: this path chooses a *destination*,
not a build.

It deliberately does **not** use the tool-mirror machinery in
[`../front-door/`](../front-door/). That exists because a ConfigMap has a size
limit and had to be sharded and gzipped; a box with a filesystem has neither
problem, so the dist is served directly.

## Not a snapshot — it pulls

Every other runner-free route this repository has publishes a snapshot and then
goes quiet. `publish-branch.sh` says so in its own header, and CLAUDE.md records
the `gh-pages` artifact being found stale on 2026-09-06, one merge behind, by a
session that had just read the section telling it to refresh by hand.

The in-cluster path never had that problem because Argo CD *pulls*. So does
this: `portfolio-site-refresh.timer` ticks every ten minutes,
[`refresh-site.sh`](./refresh-site.sh) fetches `main`, and if `main` has moved
it rebuilds and swaps the site in. A merge to `main` is the deploy again, with
no runner and no cluster in the path.

Three properties make that safe to leave unattended:

- **Fail-closed.** A release is built into a staging directory and becomes live
  only if `check.mjs` passes on it. A build with dead links or a missing page
  leaves the previous release serving and exits non-zero. The site cannot be
  replaced by a worse copy of itself.
- **Atomic.** The swap is a symlink rename, so no request sees a half-copied
  tree, and rollback is re-pointing `current` at the previous release, which is
  still on disk (`SITE_KEEP=3`).
- **Quiet.** A tick that finds `main` unmoved costs one `git fetch`.

`gitops/tests/test_portfolio_site_host.py` asserts the fail-closed behaviour
directly rather than reading it off the source, because it is the whole basis
for letting a timer redeploy the site with nobody watching.

## It is also the only host that can announce the catalogue

After a successful swap, `refresh-site.sh` submits the release to
[IndexNow](https://www.indexnow.org/) via
[`platform/marketing/indexnow.mjs`](../../../platform/marketing/indexnow.mjs).
That is not duplication of what `publish-branch.sh` already does — it is the
only place the announcement can actually happen. Look at where each publisher
stands:

| publisher | egress to `api.indexnow.org` |
|---|---|
| `platform/pages/publish-branch.sh`, run from an agent session | none — the sandbox answers `403 to CONNECT` |
| `.github/workflows/publish-pages-branch.yml` | yes, and it needs a metered Actions runner |
| **this box** | **yes, and nothing is in the way** |

It matters because of what `platform/ci/pages_state.py`'s `indexing` row
measured: served from a project-Pages *subpath*, this catalogue's `robots.txt`
— and the `Sitemap:` line naming every published page — is not the file a
crawler reads, so sitemap auto-discovery has never once happened. IndexNow is
the one enumeration route that survives that, because the protocol lets a
submitter name its key's location per request instead of assuming the host
root. Until this landed, the repository owned that route and could not execute
it.

Two properties make it safe in an unattended timer, both pinned by tests:

- **It never fails the refresh.** The swap has already happened; the site is
  live. A failed announcement logs and returns 0, so a box serving correct
  content never enters a failed unit state. An older checkout with no
  `indexnow.mjs`, and a host with no egress, are both clean holds.
- **It never announces silently.** The outcome is logged either way. This is an
  executed step rather than a line of prose precisely because the prose version
  of the same instruction is what `publish-branch.sh`'s own header records
  being skipped by every session that read it.

`SITE_INDEXNOW=0` skips it, for a rollback or a release about to be replaced.
A tick that finds `main` unmoved does not announce at all — there is nothing
new to tell a crawler about.

`SITE_BASE_URL` is passed through as `--base-url`. That matters here: this
deploy checkout tracks `main` and never fetches `gh-pages`, so without it
`indexnow.mjs` would fall back to reading the origin out of the artifact's own
`catalog.json`. Correct either way, but the box saying which origin it serves
is the stronger statement.

## TLS is not optional here

`marisstella.dev` is a `.dev` name, and Google submitted the **entire `.dev`
TLD** to the browsers' HSTS preload list. Every mainstream browser rewrites
`http://` to `https://` before it opens a socket, so the pre-TLS config serves
`curl` and nobody else.

That is worth stating loudly because the failure is so quiet: an owner who
stopped after `install` would see `curl` return 200 on every path, `--check`
report a healthy install, and every real browser refuse the site. `--check`
says so explicitly rather than reporting a clean HTTP install as if it were a
serving one.

Certificates come from Let's Encrypt via `certbot certonly --webroot` — not the
`--nginx` plugin, which edits the server block in place and would fight this
installer's own idempotent re-render of that same file.

## Install

### As part of the recovery (preferred)

`bootstrap/restore-cluster.sh` takes this as step 11, alongside the Codex
worker and the self-hosted runner, so the whole surface comes back in one pass
while the operator is still holding the SSH key:

```bash
CONFIRM=restore-cluster \
  WITH_CODEX_HOST=1 WITH_GITHUB_RUNNER_HOST=1 \
  WITH_PORTFOLIO_SITE_HOST=1 \
  SITE_GH_TOKEN=<fine-grained PAT, Contents: Read> \
  SITE_TLS_EMAIL=you@example.com \
  bootstrap/restore-cluster.sh
```

It goes on the **control-plane box**, because that is where the apex, `www` and
`tools` all resolve — on the agent box it would serve correctly to nobody.
Add `DRY_RUN=1` to see the plan, which also warns if `SITE_GH_TOKEN` is unset.

Unlike steps 9 and 10 this one needs its credential **up front**: the origin is
private, so the deploy checkout cannot be cloned without a token, and an
install that got that far and stopped would leave nothing serving. The token
reaches the box over stdin via `--credentials`, never in the remote command
string where it would show in the box's own `ps`. Without it the step skips
and says so rather than half-installing.

`SITE_TLS_EMAIL` is optional; without it the site is served over HTTP and you
add the certificate afterwards with `--tls`.

### From your laptop, standalone

If you are not rebuilding the cluster — and serving this site needs no cluster
at all — there is a one-command driver, the same shape as the Codex worker's
and the runner's:

```bash
./bootstrap/scripts/setup-portfolio-site-from-laptop.sh              # full run
./bootstrap/scripts/setup-portfolio-site-from-laptop.sh --check      # report only
SITE_TLS_EMAIL=you@example.com \
  ./bootstrap/scripts/setup-portfolio-site-from-laptop.sh --tls      # and a cert
```

It discovers the key that opens the box, checks where `marisstella.dev`
actually resolves before it starts, copies the checkout, hands the PAT over on
stdin, runs the installer, and then asks nginx for a status code rather than
reporting success from a config it just wrote.

It handles the two orderings the "By hand" section below describes, which is
the whole reason it is not a copy of the other two drivers: the credential is
written **before** the install, because the install is what clones; and `.git`
is excluded from the rsync only when a token exists, because without one that
`.git` is the only thing the fallback can clone from.
`gitops/tests/test_setup_portfolio_site_from_laptop.py` pins both against a
stubbed box.

### By hand

Run it on the box, as root, from a checkout of this repository.

```bash
# on your laptop — keep .git, the deploy checkout is cloned from it if the
# origin is unreachable
rsync -a ./ root@<box>:/root/monorepo-projects/

# on the box
cd /root/monorepo-projects
CONFIRM=install-portfolio-site-host ./bootstrap/scripts/install-portfolio-site-host.sh
SITE_TLS_EMAIL=you@example.com CONFIRM=install-portfolio-site-host \
  ./bootstrap/scripts/install-portfolio-site-host.sh --tls
```

The first command installs prerequisites' *absence check*, creates the deploy
checkout, builds and validates the first release, configures nginx, and enables
the refresh timer. The second obtains the certificate and swaps in the TLS
config. Both are idempotent.

Then give it read access so it keeps itself current. This reads **stdin, never
argv**, so nothing lands in shell history or in `ps`:

```bash
./bootstrap/scripts/install-portfolio-site-host.sh --credentials <<'EOF'
GH_TOKEN=<fine-grained PAT, Contents: Read on this repository>
EOF
```

Without it the box still serves — the installer falls back to cloning the tree
you rsync'd — it just cannot see that `main` has moved. That fallback is
deliberate: an installer that "succeeds" onto a box which then serves nothing
is the failure [`gitops/agents/host/README.md`](../../agents/host/README.md)
records this repository already paying for.

## Operate

```bash
./bootstrap/scripts/install-portfolio-site-host.sh --check   # what is installed, what is missing
systemctl list-timers portfolio-site-refresh.timer          # when it next rebuilds
journalctl -u portfolio-site-refresh.service -f             # what it did
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/healthz
```

`--check` starts nothing and writes nothing.

To roll back, point the symlink at a kept release — no rebuild, no fetch:

```bash
ls /var/lib/portfolio-site/releases
ln -sfnT /var/lib/portfolio-site/releases/<older> /var/lib/portfolio-site/current
```

To stop it, `systemctl disable --now portfolio-site-refresh.timer`. To remove
it, `CONFIRM=install-portfolio-site-host ./bootstrap/scripts/install-portfolio-site-host.sh --uninstall`
— which deliberately keeps the credentials file, the built releases (rollback
material) and the certificate.

## Two things measured rather than assumed

Both were found by running this against a real nginx, and neither would have
been visible in a diff:

- **`.mjs` had to be typed explicitly.** nginx's stock `mime.types` carries no
  `.mjs` entry, so modules were served as `application/octet-stream` — and a
  browser *refuses* to execute an `<script type="module">` with a
  non-JavaScript MIME type rather than merely mistyping it. Every tool page
  loads `pf-invalid.mjs` plus each venture's own `calc`/`share`/`proposal`/
  `usage` modules, so the failure mode was: **200 on every request, and every
  calculator on the site inert.** No page-level check would have caught it.
- **`listen [::]:80` is fatal on a box without IPv6** — `socket() failed (97:
  Address family not supported by protocol)`, and nginx refuses to start at
  all. Hetzner Cloud servers do get a `/64`, so the normal case is fine; the
  installer comments the line out when `/proc/net/if_inet6` is absent so the
  abnormal case degrades to IPv4-only instead of to a dark site.

## Known limits

- **One box.** There is no second replica and no load balancer. That matches
  what this catalogue is: static client-side calculators, where an outage costs
  availability and nothing else.
- **No per-request isolation from the other host-mode tenants.** The Codex
  worker and the Actions runner run `Nice=10`/`IOSchedulingClass=idle`
  precisely so that, as their units put it, "if the box is also serving the
  portfolio, the site wins". This unit is `Nice=5`.
- **The refresh timer is not a build farm.** A rebuild is ~25 seconds of Node
  on the box. If merges ever arrive faster than that, shorten nothing —
  reconsider whether the box should be building at all.
- **`--tls` talks to Let's Encrypt**, which is an external service and subject
  to its rate limits (5 duplicate certificates per week). `--keep-until-expiring`
  is passed so re-running it is cheap, but do not loop it.
