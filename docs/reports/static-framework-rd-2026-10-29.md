# A static framework for a site written by agents: R&D direction (2026-10-29)

The owner asked what it would look like to build a static web framework for
sites like the GitHub Pages catalogue: written entirely by AI agents, very
large, and built with performance as the main goal. This note measures the
site as it is today, says where a framework would help and where it would
not, and proposes a staged R&D programme with a first experiment for each
stage. The blog post is
`docs/posts/2026-10-29-what-a-static-framework-for-an-agent-written-site-needs.md`.

Prior answers to a narrower question ("should Pages move to another
framework, language or WASM?") said no rewrite: `docs/history/pages-build-perf-2026-10-20.md`
and `docs/history/pages-build-speed-2026-10-24.md`. Those still hold. A
rewrite in another language would not fix any of the problems below. They
are problems of **architecture and contracts**, not of speed per line of
code.

## What the site is today (measured)

Built at `main` 65032126 in the cloud container (4 cores, Node 22):
`node platform/pages/build.mjs --out=<dist> --audio-cdn`, then
`node docs/reports/assets/static-framework/measure.mjs <dist>` (raw output:
`assets/static-framework/measure-2026-10-29.json`) and `drift.mjs`.

| measure | value |
|---|---|
| full build, wall time | 2 min 56 s (user 5 min 01 s) |
| files in the artifact | 18,636, 403 MB (audio already on jsDelivr) |
| HTML pages | 5,344 (135.5 MB raw, 41.2 MB gzip) |
| PNG (mostly share cards) | 3,689 files, 196 MB: **49% of the artifact** |
| median page | 23.0 KB raw, **7.4 KB gzip**; p90 10.3 KB, p99 21.3 KB gzip |
| inline `<style>`+`<script>` bytes | 34.5 MB, of which **21.0 MB (61%) are blocks repeated verbatim on other pages** |
| biggest repeated blocks | research page CSS, 7.8 KB on 1,055 pages; blog post CSS, 5.9 KB on 998 pages |
| heaviest pages | `/research/` 1.42 MB raw, **240 KB gzip on the live site**; `/writing/` 962 KB; `/guides/` 805 KB |
| design drift | 78 distinct `--accent` values, 555 distinct `:root` token blocks, 5 variants of the service-worker registration snippet |
| whole-site rewrite passes after copy | at least 7 (navigation, saved bids, share link, embed offer, sponsor link, share tags, offline layer) |

Live hosting (curl, 2026-10-29): GitHub Pages sends `cache-control:
max-age=600` on everything and gzip only, even when the request offers
Brotli. There is no way to set headers.

### What the numbers say

1. **A typical page is already fast.** 7.4 KB gzip is small. Most visitors
   land from search on one page and leave; for them the page is fine. A
   framework cannot make that page much faster, and anyone who says it will is
   selling something.
2. **Indexes grow with the agents and nobody stops them.** `/research/` lists
   all 1,055 research projects on one page: 240 KB gzip over the wire, 3,342
   links. Every run that adds a project makes it heavier. This is the clearest
   visitor-side cost, and it is a property of agent-written sites in general:
   output keeps arriving, and an "index" written once as a flat list grows
   without limit.
3. **Shared design is copied, not shared.** Each generator (the catalogue
   build, the research homepage, the blog) inlines its own stylesheet into every
   page it writes. On a research page the inline CSS is 36% of the gzip bytes
   (8,054 to 5,162 without it); on a post it is 32%. That is the right
   trade for a one-page visitor (no extra render-blocking request) and the
   wrong one for a reader who opens a second page.
4. **Agents drift.** 555 different `:root` token sets and 5 copies of the same
   four-line service-worker snippet that differ by a few bytes are what happens
   when hundreds of independent runs each write "a reasonable page". Nobody
   decided on 78 accent colours. Some of that is deliberate per-product
   branding; most of it is not.
5. **The build is a pipeline of string rewrites.** Each pass reads every page,
   regex-edits it and writes it back. A one-post merge rebuilds and rewrites
   all 5,344 pages, then `check.mjs` reads them all again (59 to 75 s). At
   100 to 150 merges a day that is most of the deploy queue.
6. **Images, not HTML, are the artifact.** Half the bytes are share cards.
   They are already cached between runs by content hash (the 2026-10-24 work);
   the format and palette have not been looked at since level-6 deflate.

## What a framework for this site would be

Not a new templating language. The site's content is already plain HTML that
agents write well. The framework is the **compiler and the contracts around
that HTML**, so that hundreds of uncoordinated runs produce a site that stays
fast and consistent without anyone having to remember to.

### 1. Pages are values in a build graph, not files on a disk

Every page is a pure function of named inputs (its source file, its template
version, the data it reads). The build hashes the inputs and skips any page
whose hash is unchanged since the last deploy, keeping the previous output.
Indexes, sitemaps and feeds are pages too, with their inputs listed.

- A one-post merge should rebuild one post, one index shard, the feed and one
  sitemap shard. Target: under 10 s, not 3 min.
- The output check (`check.mjs`) runs incrementally on the same graph: a
  link is checked when either end changes.
- Prior art: Bazel/Buck-style content-addressed actions; Eleventy's and Hugo's
  incremental modes (both re-render by file, not by declared input, so a
  template edit or a shared data file still rebuilds everything).

### 2. One parse, one write

Each page is parsed once into a small structured form (head slots, body,
asset references, outgoing links), every transform runs on that form in
memory, and the page is serialised once. Transforms declare what they read
and what they add, so the order is checked, not hoped for. This replaces the
7+ read-regex-write passes and removes a class of bugs where pass B misses
what pass A added (the 2026-10-24 note found pages built after the share pass
shipped without share tags; the workflow now runs that pass a second time).

### 3. Contracts the compiler enforces instead of conventions agents forget

| contract | enforced how | what it fixes |
|---|---|---|
| **byte budgets** per page type (for example 15 KB gzip for a tool page, 40 KB for an index shard) | build fails with the page, the budget and the three biggest contributors | index growth; drift into heavy pages |
| **indexes must shard** past N entries | index pages are generated with pagination plus a search index fetched on demand | the 240 KB `/research/` page |
| **design tokens are imported, not written** | the compiler rewrites a page's `:root` block to the shared token file unless the page declares a product theme | 555 token sets, 78 accents |
| **shared snippets are referenced** | any inline block seen on more than K pages is hoisted to a hashed file automatically (agents can keep writing inline) | 21 MB of repeated inline code; 5 snippet variants |
| **links are typed** | a link to a page in the graph resolves at build time; a dead one fails before output | the class `check.mjs` catches after the fact |
| **every user-facing page has the disclaimer and usage counter** | a page type without them does not compile | the repo's own rule, checked today by tests |

The pattern: **agents write content; the compiler owns the invariants.** That
is the repo's own rule of thumb ("software for the routine, agents for
judgment") applied to the site.

### 4. Agent ergonomics are a performance feature

Agent time is the scarce budget. A framework built for agents should make
the inner loop fast and the error messages actionable:

- `build --only <page>` in under a second, with the page's budget report;
- errors that name the fix ("index has 1,055 entries; set `shard: 50` in its
  front matter"), because an agent will do what the error says;
- one schema per page type, readable from a single file, so a run does not
  need to read 11,570 lines of `build.mjs` to add a page.

### 5. Delivery that fits GitHub Pages

GitHub Pages fixes the headers: `max-age=600`, gzip only. So:

- hashed asset names do not buy `immutable` caching from the server; the
  site's existing service worker (the offline layer) can give them that on a
  second visit, and that is where hoisted CSS pays off;
- first-visit pages keep their critical CSS inline (the one-page search
  visitor is the common case), and the hoisted copy is used once the service
  worker has it. Whether this beats inlining everything has to be measured,
  not assumed (experiment B below);
- no Brotli from the origin, so pre-compressing is wasted; byte budgets are
  stated in gzip.

### What it would not do

It would not change the language (the hot loops are zlib and image drawing,
both native already), would not add a client-side framework (pages have
almost no script and should keep it that way), and would not ask agents to
learn a new syntax.

## Proposed R&D programme: staged, each stage shippable

Each stage is useful on its own and lands in `platform/pages/` behind the
existing `build.mjs` entry point, so nothing breaks while it is built.

| stage | question | first experiment | done when |
|---|---|---|---|
| **A. Shard the indexes** | how much does the heaviest-page tail shrink? | paginate `/research/`, `/writing/`, `/guides/` at 50 entries plus a JSON search shard; measure gzip bytes and LCP with Playwright on a throttled profile | no page over 40 KB gzip; search still finds every entry |
| **B. Hoist or inline?** | for this site's traffic shape, does a shared hashed stylesheet beat inline CSS? | build both variants of the research and writing pages; measure first-view and second-view bytes and render time (Playwright, cold and warm SW) | a measured answer, either way, with the rule set from it |
| **C. Token lint and auto-fix** | how much of the drift is deliberate? | classify the 555 `:root` blocks into shared template, product theme and drift; auto-rewrite the drift class | drift class rewritten; product themes declared |
| **D. Build graph** | what does an incremental build save on a real day of merges? | replay the last 100 merges on `main`: full rebuild versus graph rebuild, compare outputs byte for byte | identical output; median merge-to-artifact time stated |
| **E. One-pass transforms** | can the 7 passes become one without output changes? | port the passes to a parsed-page form one at a time, diffing `dist` after each | `diff -r` clean; build time stated |
| **F. Share-card bytes** | can the 196 MB of cards shrink without a visible change? | palette (8-bit) PNG for the flat-colour cards versus today's truecolour; check pixels and size; confirm crawlers still render | bytes stated; card tests updated |

**A is the best first step**: it is the largest visitor-facing cost, it is
small, and it needs no new architecture. **D is the deep one**: it is the
piece no existing static site generator does well for a site this size with
this merge rate, and it is the part that could become a research programme
(an empirical study of agent-written web corpora, their drift and growth, and
whether compiler-enforced invariants hold them in shape; a
candidate venue is ICSE's Software Engineering in Practice track). That framing would
need the `research/PROGRAMMES.md` bar (a real question, baselines, a named
venue) before it gets a directory; this note is the proposal's evidence, not
the proposal.

## Reproduce

```
node platform/pages/build.mjs --out=/tmp/dist --audio-cdn
node docs/reports/assets/static-framework/measure.mjs /tmp/dist
(cd /tmp && node /path/to/repo/docs/reports/assets/static-framework/drift.mjs)
curl -sSI https://duncan-haywood.github.io/oss-monorepo/research/ | grep -i -E 'cache-control|content-encoding|content-length'
```

Caveats: one machine, one build; the regex extraction in `measure.mjs`
counts bytes, it does not parse HTML; the drift count includes deliberate
product themes, which stage C would separate out.
