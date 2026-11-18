# platform/seo: the search-ranking feedback loop

**Ongoing goal (owner, 2026-11-03):** "the page doesn't seem to rank on
anything. let's have it be an ongoing goal to optimize ranking on google and
for ai agents web search. with a feedback test loop for it."

Every SEO or AEO change is a hypothesis about rankings. This directory
measures rankings so the hypothesis can be checked. The loop:

1. **Measure.** `probe.py` takes readings and appends them to
   `history/observations.jsonl`. The file is append-only, and every reading is
   dated and names its engine.
2. **Change something.** Log it in [`EXPERIMENTS.md`](EXPERIMENTS.md) first,
   with the date, what changed, which queries it should move and the
   earliest date a move could show.
3. **Measure again** on or after that date, then write the result into the
   experiment's entry, including "no change". `probe.py report --write`
   regenerates [`STATUS.md`](STATUS.md).

The queries are in [`queries.json`](queries.json), in three tiers that form a
ladder:

| tier | what it means when we rank | expected order |
|---|---|---|
| `brand` | the domain is indexed at all ("Maris Stella Labs", "marisstella.app") | first, within weeks of verification |
| `name` | a product page is indexed (its exact name) | next |
| `intent` | we answer the problem a person types (e.g. "free wall framing calculator studs headers cripples") | the real goal; slow |

A tier can't be judged until the one above it shows results: an intent query
that returns nothing tells you nothing while the brand query also returns
nothing.

## Engines

| engine | how | needs | status 2026-11-03 |
|---|---|---|---|
| `claude-websearch` | an agent session runs its own web-search tool and records the URLs (`record`) | nothing | **works today**; it is the "AI agents' web search" view directly |
| `gsc` | Google Search Console Search Analytics: clicks, impressions, average position per query and page | owner: verified property + `GSC_SERVICE_ACCOUNT_JSON` | blocked on `search-engine-verification` in `portfolio/ledger/asks.yaml` |
| `brave` | Brave Search API, top 20 per query | `BRAVE_API_KEY` | no key; `api.search.brave.com` is reachable from a cloud session |
| `audit` | fetches the live site: robots.txt, sitemaps, a sample of pages (status, noindex, canonical, title, description, h1, JSON-LD), llms.txt, verification tags | nothing | works; 0 blockers on 2026-11-03 |

A missing key, or no answer at all (DNS, refused connection, timeout, the
session proxy's refusal), exits 2 and records nothing. That reading is
**unmeasured**, never zero; exit 1 always means the audit found a defect. The
canonical check is strict: a canonical naming the `http://`, `www.` or `?query`
variant of a page is a blocker (search engines key those as different URLs);
only a trailing-slash difference is a warning.

## What a session does (about 10 minutes)

```
python3 platform/seo/probe.py next -n 6            # least recently probed queries
#   run each query through your web-search tool, then for each:
python3 platform/seo/probe.py record <query-id> <url1> <url2> ...   # results in order
python3 platform/seo/probe.py record <query-id> --empty             # search returned nothing
python3 platform/seo/probe.py audit                # weekly is plenty
python3 platform/seo/probe.py report --write       # refresh STATUS.md
python3 platform/ci/test_seo_probe.py                 # tests, no network
```

Record every URL the search shows, in order, not just ours. A list without our
site is the measurement. Use `--engine google-manual` for a search done by a
person in a logged-out browser. Don't record a search you didn't run, and
don't re-record one to change its result.

The `polish` track (`prompts/polish/prompt-0.md`, SEO and AEO) is the natural
home for this. Any run that touches SEO should leave at least one fresh reading
behind.

## Owner steps

These are the only parts an agent can't do. The full text is the
`search-engine-verification` row in `portfolio/ledger/asks.yaml`.

1. **Google Search Console:** add the URL-prefix property
   `https://marisstella.app/` and choose "HTML tag". Paste the `content` value
   into `google` in [`site-verification.json`](site-verification.json) and
   merge; the build adds the tag to the home page (`platform/pages/site-verification.mjs`). Then
   press Verify and submit `sitemap.xml`.
2. **Bing Webmaster Tools:** import from Search Console, or add a meta tag
   under `bing` the same way.
3. **Optional, for real Google numbers:** a service account with read access
   to the property, stored as the secret `GSC_SERVICE_ACCOUNT_JSON`.
   `probe.py gsc` signs its token with the `openssl` CLI, so it needs no
   Python packages.

## Why the site ranked on nothing (diagnosis, 2026-11-03)

- **The domain is four days old.** marisstella.app has served the site since
  2026-10-30. Before that the site lived on a GitHub Pages subpath, where
  `robots.txt` was unreachable, so the sitemap was never auto-discovered
  (`platform/marketing/README.md`).
- **No search engine had been told.** There was no Search Console property, no
  Bing property, and the deploy workflow's IndexNow step only runs when a
  deploy finishes. On 2026-11-03 the ten most recent deploy runs were all
  cancelled by the merge after them (`platform/ci/indexnow_state.py`).
- **Inbound links pointed at the old address.** 3,600+ README and VENTURE.yaml
  links on GitHub, the most heavily crawled page that links to us, named
  `duncan-haywood.github.io/oss-monorepo/`. That address now serves
  meta-refresh stubs.
- **On-page was not the problem.** The audit found no blocker, and
  `platform/pages/check.mjs` already enforces canonicals, sitemaps, unique
  titles and JSON-LD on every build. The only warnings are long titles (over
  70 characters), which Google rewrites; it doesn't drop the page.
- **The brand name collides** with Stella Maris parishes, colleges and apps.
  Brand queries will need the domain or "Labs" to win.

The first two experiments in `EXPERIMENTS.md` address the second and third
points.
