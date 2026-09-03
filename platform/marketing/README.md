# platform/marketing

Distribution surfaces that are **not** part of the assembled tools site.

`platform/pages/` builds `tools.marisstella.dev` — 169 tools, 544 pages, its
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

### The category pages at `https://marisstella.dev/c/<id>/`

`renderCategoryPage` in the same module writes one browse page per category the
apex serves tools for — seven today, into `gitops/prod/front-door/c__<id>.html`,
mounted at the document root and routed by the `^/c/(?<cat>…)/?$` block in
`front-door/default.conf`. A ConfigMap key cannot contain `/`, which is the
whole reason the URL and the stored key differ; `categoryPageKey` and that
nginx rewrite are the two halves of the mapping and a test pins them together.

**Why they exist.** `build.mjs` has rendered category pages since the site build
was written, and every one has been published nowhere: they belong to
`tools.marisstella.dev`, which fails closed on the unsealed `portfolio-site-repo`
Secret. So `CATEGORY_PAGE_COPY`'s per-category copy and `SUBCATEGORY_RULES`'
sub-grouping — both written, both tested — had never reached a reader. That is
the same shape as the `ENTRY_OVERRIDES` bug in `CLAUDE.md`: a surface the
canonical build knows how to make, on a host that does not serve.

**Why they are not a second copy of the front page.** The front page lists every
mirrored tool under a flat category heading. A category page carries
`categoryPageCopy`'s own title, description and intro, and sub-groups its tools
— which is the difference between browsing 116 trades calculators and scrolling
past them. Both come from `build.mjs` by import, never by restatement; `CLAUDE.md`
records two separate occasions where copying a rule out of that file instead of
importing it cost live product.

**What they replaced.** The page's JSON-LD `hasPart` named seven
`CollectionPage` URLs on `tools.marisstella.dev`. The cards and the footer had
already been fixed to stop sending clicks there; the structured data had not, so
the page went on telling exactly the crawlers this portfolio is trying to be
found by that its seven collections lived at URLs serving nothing. `hasPart`,
the cards and the sitemap now all name the apex — and, because the pages are
real, the sitemap can ask for them to be indexed.

### Why it does not list the tools

`portfolio-apex.yaml` explains at length why two hostnames must not serve the
same bytes: `build.mjs` stamps one canonical host into all 544 pages, and a
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

### Merging two branches that both touch the mirror

`front-door-tools.mjs` packs the mirror into shards **sequentially**, so
inserting one page shifts every file after it into a different shard. Two
branches that each add a page therefore always conflict — in
`kustomization.yaml`, and in whichever `.gz` blobs moved.

That conflict has one correct resolution, and it is never "pick a side":
both sides are stale the moment they meet, because the right answer is
whatever the generator produces from the *merged* sources. Taking either
branch's copy leaves the apex serving a mirror that does not match the
ventures on `main` — the new page missing, or an `index.html` without its
own footer link to it. `front-door-tools.test.mjs` catches that, which is
why a stale merge shows up as three failures in `validate`.

```
git merge origin/main                            # conflicts
./platform/marketing/resolve-mirror-merge.sh     # regenerates and verifies
git commit                                       # you write the message
```

The script refuses unless a merge is in progress, and refuses outright if
any conflicted path lies outside `gitops/prod/front-door-tools/` — a
conflict in authored code is two people editing the same lines and needs
a human, not a regeneration. It stages but does not commit.

On 2026-09-02 five branches hit this inside an hour and each was resolved
by re-deriving the same four commands by hand; that is what the script is
for.

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
