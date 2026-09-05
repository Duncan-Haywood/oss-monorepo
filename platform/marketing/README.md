# platform/marketing

Distribution surfaces that are **not** part of the assembled tools site.

`platform/pages/` builds `tools.marisstella.dev` — every venture with a static
surface, plus its own hub, feed, sitemaps and social cards. Anything that
belongs *on* that site goes there. This directory is for the surfaces that sit
outside it and would be wrong to fold in.

(This line carried a tool and page count until 2026-09-04, and both were stale
by four and by a hundred respectively. A count here is a second copy of a
number the build already prints and nothing checks it, so it goes stale
silently and quietly misinforms the next reader about how big the site is. Run
`node platform/pages/build.mjs` and read the totals off the run instead.)

## Regenerating: one command, always

**After any change to a venture page, run `node platform/marketing/regen.mjs`.**

The apex's committed surface comes from **two** generators — `front-door.mjs`
(the page, category pages, About, `robots.txt`, `sitemap.xml`, `feed.xml`,
`llms.txt`, `catalog.json`, the card and icon) and `front-door-tools.mjs` (the
mirrored tools as gzipped ConfigMap shards, their kustomization and the nginx
alias map). Both read the same venture tree, so one venture edit can invalidate
either or both, and running only one leaves the served surface half-updated.

This line used to read "there is one today", and on 2026-09-05 that cost live
product. #3256 added `ventures/einvoice-preflight/vs-avalara.html` and ran
neither generator; `platform/pages/build.mjs` and `check.mjs` both passed
because they build the *other* host. #3257 and #3258 then each hit the mirror
tests, ran the single command those tests named, saw their own test go green,
and reported success. `main` ended red on six tests with the new page mirrored
nowhere and absent from the sitemap the apex serves — built, deployed, and
findable by nobody.

Nobody was careless there: each session ran exactly the command it was handed.
So the fix is in the hint, not in the discipline. Every staleness assertion in
this directory now names `regen.mjs`, and `regen.test.mjs` fails if one ever
names an individual generator again. `regen.mjs` discovers the generator set
from the directory rather than restating it, so a third one is picked up with
no edit — see CLAUDE.md, "168 became 169", for what a copied list costs here.

```
node platform/marketing/regen.mjs           # run every generator
node platform/marketing/regen.mjs --check   # list what would run, write nothing
```

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

## The embed offer on the apex

`platform/pages/embed.mjs` calls itself "Priority 1 of the
marketing-distribution queue item", and until 2026-09-03 it shipped only on
`tools.marisstella.dev` — the host that fails closed on the unsealed
`portfolio-site-repo` Secret and has never served a byte. So the portfolio's
best organic-distribution asset reached nobody, while the apex served all 169
tools with no way for a stranger's page to host one. Same shape as the
`ENTRY_OVERRIDES` bug in `CLAUDE.md`: a surface the canonical build knows how
to make, on a host that does not serve.

Three pieces, and none of them is a second copy of the widget:

- `injectMirrorEmbed` (in `front-door-tools.mjs`) gives a mirrored entry page
  the `pf-chrome-foot` that the real `injectEmbedWidget` attaches to, then
  calls it. The box, the snippet, the stylesheet link and the script tag stay
  defined in `embed.mjs` alone.
- `front-door.mjs --write` writes `pf-embed.js` and `pf-embed.css` to the apex
  document root from `renderEmbedModule`/`renderEmbedStyle`. `front-door.test.mjs`
  fails on a stale commit, so an edit to the widget cannot leave the apex
  serving last week's runtime.
- `front-door/default.conf` maps `?pfEmbed=1` to a framable response on the
  tool entry page **and nowhere else**. `X-Frame-Options: DENY` is enforced
  before any page script runs, so without this the feature would ship correct
  HTML, a correct runtime, a green test suite, and an iframe every browser
  refuses.

The snippet points at `mirrorCanonicalUrl` — "the address that actually
serves", which is the apex today and the tools host after the seal. Not
`canonicalUrl`: a snippet is copied once into someone's page and then outlives
every deploy here, so naming a dark host would hand out iframes that render
blank and stay blank.

Framing these pages is safe in a way it would not be for an application. Every
mirrored tool is static, computes in the visitor's own browser, and has no
account, no cookie and no server-side state, so there is no authenticated
action for a clickjacking overlay to borrow. The narrowness is pinned by
`test_nothing_but_a_tool_entry_page_is_framable`, which runs against real
nginx.

Embedded views are counted: nginx writes `$portfolio_embed_view` as the log's
fourth field, and `gitops/prod/usage/aggregate.py` already folds it under its
`EMBED_PREFIX`. That answers the question raw hit counts cannot — whether 300
views are 300 searchers or one popular embed on a trade forum, which imply
opposite next moves.
