# Portfolio site, host mode

The catalogue served by the Hetzner box's own **nginx and systemd**, instead of
by Argo CD and the k3s Ingress. Same artifact, same checks, same headers —
different place to stand.

## Why this exists

This repository has ~175 finished products and, as of 2026-09-06, no way for a
stranger to open any of them. Every route to a public surface is down, and two
of the three are down *because they were built on top of each other*:

| route | state | why |
|---|---|---|
| Argo CD on k3s ([`gitops/prod`](../)) | down | `:6443` refused on both boxes — [`Outage triage`](../../../.github/workflows/outage-triage.yml) run 33889983086 |
| GitHub Pages ([`portfolio-pages.yml`](../../../.github/workflows/portfolio-pages.yml)) | down | needs an Actions runner; metered minutes exhausted |
| self-hosted runners ([`gitops/ci/`](../../ci/README.md)) | down | they run **as pods in that same k3s** |

[`gitops/agents/host/`](../../agents/host/README.md) and
[`gitops/ci/host/`](../../ci/host/README.md) already answer this for the two
things that *build* — put them on the box's own systemd, where neither k3s nor
an Actions runner is in the way. Both of their READMEs note the boxes
themselves were up the whole time: `:22` answers on both.

Nothing had yet done the same for the thing that **serves**. So the repository
could restore its dev capacity and its CI onto a box that still showed a
stranger a refused connection. This closes that gap, and it is the only one of
the three whose completion a *user* can see.

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
