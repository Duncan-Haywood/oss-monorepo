# platform/marketing

Distribution surfaces that are **not** part of the assembled tools site.
`platform/pages/` builds the site itself; anything that belongs *on* it goes
there.

Today this directory holds one tool, the IndexNow submitter. Until 2026-10-30
it also held the generators for the `marisstella.dev` front door
(`front-door.mjs`, `front-door-tools.mjs`, `regen.mjs` and the mirror-merge
helper), which wrote a committed copy of the catalogue into `gitops/prod/` for
the retired k3s origin. That origin was deleted on 2026-10-01 and the domain's
DNS no longer resolves, so the copy served nobody; it was removed with
`gitops/`. `git log --diff-filter=D -- platform/marketing/` finds it.

## `indexnow.mjs` — telling search engines the catalogue changed

`platform/ci/pages_state.py`'s `indexing` row (2026-09-09, #4362) found that
this site's `robots.txt` — and the `Sitemap:` line naming 881 published pages
— is unreachable to a crawler, because the site is served from a project-Pages
*subpath* while `robots.txt` is only ever fetched at the *host* root. Sitemap
auto-discovery has therefore never happened, and `portfolio/usage/usage.yaml`
still carries no visitor reading for any product — `live_url_visitors` is
`null` on all 399 of them, never measured rather than measured-as-zero, which
is a different fact and licenses different decisions
(`python3 platform/ci/usage_state.py`). The real fix is the owner's
(submit `sitemap.xml` directly in Search Console, or set a custom domain — see
the `indexing` row) — but IndexNow does not have that problem, because its key
file's location is named explicitly in every submission rather than assumed at
the host root, so the same subpath that defeats `robots.txt` does not defeat
it.

```
node platform/marketing/indexnow.mjs               # dry run — prints, sends nothing
node platform/marketing/indexnow.mjs --submit       # actually notifies IndexNow
```

Reads `catalog.json` off the published `gh-pages` ref by default (what
actually publishes, not what the next build would produce), and refuses to
submit if the published key file does not match — a stale snapshot, not a
silent bad submission. Covers Bing, Yandex, Seznam and Naver; there is no
Google equivalent, so this is a complement to sitemap submission, not a
replacement for it. A session's own sandbox cannot reach `api.indexnow.org`
(the agent egress proxy blocks it, same as `github.io`) — `--submit` only
does something from a host with real egress, e.g. a GitHub Actions runner.
From a host without one it now exits `EXIT_NO_EGRESS` (3) and says so, rather
than reading like a defect in this script.

**Two shapes of "no egress", and the second is the one that actually happens
here (measured 2026-09-10).** `EXIT_NO_EGRESS` was first added on the premise
that a blocked host makes `fetch` *reject* — which is what `curl` sees
(`CONNECT tunnel failed, response 403`). Running the real thing showed
otherwise: Node's fetch resolves with an ordinary **403 carrying the proxy's
own body**, so the first revision took the generic-failure branch and reported
the sandbox limit as "IndexNow refused what we sent" — the exact confusion the
exit code exists to remove. `isEgressRefusal` now catches that shape too.

The match is deliberately narrow, on the proxy's own wording (`not in
allowlist` / `network egress settings`) rather than on the status, because
**IndexNow itself answers 403 for an invalid key** — a real defect in the
published key file, which must stay loud. A false positive here would bury it,
and that is the more expensive of the two mistakes.

**You do not have to remember to run it after a publish (changed 2026-09-10).**
This section used to end "Run it after any `publish-branch.sh` that actually
pushes", and the only other caller was a step in
`.github/workflows/publish-pages-branch.yml`. Both were correct and neither
ran: that workflow needs an Actions runner, runners have been starved since
2026-09-04, so every publish that actually reached the live site in that
window was a by-hand `publish-branch.sh` run — and each one skipped the
announcement in silence. On the origin this catalogue serves from, that is not
a small miss: `pages_state.py`'s `indexing` row measured that sitemap
auto-discovery cannot happen on a project-Pages subpath, so IndexNow is the
only enumeration route the site has left.

`publish-branch.sh` now calls this itself, in `announce_to_indexnow`, right
after a successful push, so there is one definition of "publishing includes
announcing". It never fails the publish — by then the site is already live, and
a host without egress is not a broken deploy — but it always says which of the
three outcomes happened. `INDEXNOW=0` skips it, for a publish you deliberately
do not want announced.

**That fix was necessary and it was not sufficient, measured 2026-09-11.**
Folding the call into the script made it reachable only on a run that
*pushes*, and on this repository's actual configuration no such run announces
anything:

- the by-hand route pushes, so it *does* reach the call — from an agent
  sandbox, which cannot reach `api.indexnow.org` and exits `EXIT_NO_EGRESS`
  every time, correctly, having announced nothing;
- `publish-pages-branch.yml` runs on a runner with real egress, but
  `vars.PAGES_BRANCH_PUBLISH` is not `true`, so it takes its `PUSH=0` step and
  never reaches the call at all. (Read from evidence rather than the variable,
  which a workflow cannot print: every commit on `gh-pages` is authored
  `CI <ci@example.com>`, an agent session's identity, and none by
  `github-actions[bot]`.)

So the route with egress never reached the call and the route that reached it
had no egress — between them covering every publish and announcing none of
them. The workflow now carries a step gated on the exact *complement* of the
publish gate, announcing the live `gh-pages` snapshot when the script cannot,
so precisely one of the two fires and neither a double-submit nor a silent
miss is reachable.

**And nothing said so, which is the part worth keeping.** A submission leaves
no trace in the tree — no artifact, no commit, and IndexNow has no confirmation
API — so "never announced" and "announced fine" looked identical from here for
as long as it lasted. `platform/ci/indexnow_state.py` is the reading that
tells them apart, from GitHub's own run history rather than from an absence:

```
python3 platform/ci/indexnow_state.py                    # announced / never / unknown
python3 platform/ci/indexnow_state.py --require-announced # exits 1 while unannounced
```

It reports `never` only with a named reason (every run starved, the step did
not exist yet, or it ran and failed) and reports `unknown` rather than `never`
when it cannot read — an absent measurement must not read as a measured
absence. `announced` still means *asked*: there is no confirmation API, and
Google does not participate at all, so Search Console remains the owner's.
