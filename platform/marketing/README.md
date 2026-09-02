# platform/marketing

Distribution surfaces that are **not** part of the assembled tools site.

`platform/pages/` builds `tools.marisstella.dev` — 169 tools, 524 pages, its
own hub, feed, sitemaps and social cards. Anything that belongs *on* that site
goes there. This directory is for the surfaces that sit outside it and would be
wrong to fold in.

There is one today.

## `front-door.mjs` — the page at `https://marisstella.dev/`

The portfolio's apex and `www` are claimed by `gitops/prod/portfolio-apex.yaml`.
From 2026-08-28 they 301'd to `tools.marisstella.dev`, which fails closed on
the unsealed Secret `portfolio-site-repo` — so the portfolio's own domain spent
its whole life redirecting strangers into a host that serves nothing.

This generator produces what those two names answer with instead:

```
node platform/marketing/front-door.mjs --write   # writes gitops/prod/front-door/index.html
node platform/marketing/front-door.mjs           # prints it, for a diff
node --test platform/marketing/front-door.test.mjs
```

### Why the output is committed

Argo CD delivers it, not a CI job. `gitops/prod/kustomization.yaml` reads
`front-door/index.html` into a ConfigMap with a content hash, the Deployment in
`portfolio-front.yaml` mounts it, and a merge to `main` is the deploy — no
clone token, no Actions runner, no Pages flip.

So the file in git *is* the artifact. `front-door.test.mjs` regenerates and
compares; a stale commit fails with the command that fixes it.
`hetzner-gitops-ci.yml` runs that test, and triggers on this directory and on
`platform/pages/launched.json` — the two inputs that can move the numbers the
page states.

### Why it does not list the tools

`portfolio-apex.yaml` explains at length why two hostnames must not serve the
same bytes: `build.mjs` stamps one canonical host into all 524 pages, and a
second copy in front of a crawler undoes that consolidation. This page is a
different document — positioning, one card per category, the two
`PRODUCT_PLAYBOOK.md` §5b clauses — with its own canonical and no per-tool
listing. The tests pin both properties.

It also stays small for a structural reason. A prior session measured serving
the whole site this way at 34 MB (14.4 MB gzipped) against a 1 MiB ConfigMap
ceiling; the front door is 11 KB, and a test fails it past 256 KB.

**1 MiB is not the ceiling that binds first.** Argo CD applies client-side by
default, and `kubectl apply` records the object it sent in the
`kubectl.kubernetes.io/last-applied-configuration` annotation — so the manifest
is stored twice, and the API server caps one object's annotations at 262144
bytes in total. `front-door-tools.mjs` mirrors ~600 KB of tool source into
`portfolio-front-tools`: under 1 MiB, more than double this. A ConfigMap in that
band applies as `metadata.annotations: Too long` and never reaches the cluster
at all, so the generated kustomization declares
`argocd.argoproj.io/sync-options: ServerSideApply=true`, which writes no such
annotation. `test_a_configmap_too_large_for_client_side_apply_asks_for_server_side`
in `gitops/tests/test_manifests.py` holds that for every generator in the tree,
not just this one.

### Rules for anything added here

- **Every claim must be checkable.** The counts come from
  `platform/pages/launched.json`, the one list `check.mjs` already fails the
  site build over. The privacy sentence says only what the nginx access log in
  `gitops/prod/front-door/default.conf` can support.
- **Take paths from `build.mjs`**, never typed by hand — `ABOUT_PATH`,
  `FEED_FILE`, `SOCIAL_CARD_FILE`, `categoryPagePath`. A renamed category
  prefix then changes this page in the same commit instead of leaving the apex
  pointing at a 404.
- **Publishing outward is the owner's**, per `CLAUDE.md`. Building an asset
  here is always allowed; submitting the portfolio to a directory, opening an
  account, or posting under its name is not.
