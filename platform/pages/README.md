# Portfolio Pages

The public site. `build.mjs` assembles every static, browser-runnable venture
surface in this repository into one GitHub Pages deployment, behind a hub page
that lists and searches them.

```
node platform/pages/build.mjs                    # build into platform/pages/dist
node platform/pages/check.mjs                    # check that artifact (--dist=DIR for another)
cd platform/pages && node --test "*.test.mjs"   # what CI runs
```

The site's experiments live in the lab (`lab/`, built by `lab.mjs`); its charter, roadmap and log are in [`LAB.md`](LAB.md).

Then, in a browser, the seven checks CI cannot run — `journey.mjs` (the customer
journey), `sweep.mjs` (does every tool still compute), `contrast.mjs` (can
every page be read and reached), `roundtrip.mjs` (does a shared bid arrive as
the bid that was sent), `presets.mjs` (does picking "no preset" leave the
takeoff alone), `highlight.mjs` (does a rejected input get pointed at), and
`sideways.mjs` (does any page scroll sideways on a phone).
See [Driving the customer journey](#driving-the-customer-journey).

Run all seven with one command, which builds, serves and tears down for you:

```
python3 platform/ci/browser_checks.py            # all seven, fresh build
python3 platform/ci/browser_checks.py --checks sweep,sideways --dist platform/pages/dist
python3 platform/ci/browser_checks.py --only ebay-fee-calculator   # one venture
```

`--only` is the one to reach for while working on a single venture. A
whole-site run is the whole catalogue and takes 20-30 minutes, which is why
`browser-checks-ci.yml` is nightly rather than a merge gate; scoped to one
venture it is under a minute. Measured on 2026-09-04, `roundtrip` alone:
**6m15s whole site, 27s scoped to `ebay-fee-calculator`** — and most of that
27s is the site build the check shares. All six per-venture checks honour it;
`journey.mjs` is a single narrative over the whole site and ignores it, saying
so when you ask for both.

Two things it will not do, because a filter is a way to verify *less*:

- A slug that is not in the built site **stops the run with exit 2** before a
  browser starts, rather than quietly reducing the run to nothing. A typo names
  itself.
- A filtered run is stamped `[FILTERED: ...]` on its summary line and never
  prints the sentence a whole-site pass prints. "All 7 browser checks passed"
  over four pages would be the most misleading true sentence this tool could
  produce.

`presets.mjs`, `roundtrip.mjs` and `highlight.mjs` have always taken slugs as
positional arguments when run standalone, and still do — `--only` is how that
reaches all six through the harness, which runs each check with no arguments.

Prefer it over starting a server by hand. It removes both traps the checks
below document: it **refuses to run** unless the origin echoes a sentinel token
it just wrote into the tree under test (so a leftover server answering for an
older build is an error, not a false pass), and it serves through a *threading*
server, so the single-threaded `http.server` drops that produce phantom
`requestfailed` findings do not happen. Every check still runs standalone
exactly as documented — this only orchestrates them.

It finds Playwright and axe-core rather than asking you to name them, so the
`PLAYWRIGHT=$(npm root -g)/playwright/index.js` prefix these commands used to
carry is only needed where a global, `NODE_PATH`, or in-repo install is not
what you have. `PLAYWRIGHT` and `AXE` still win when set.

**Read its exit code as three outcomes, not two.** Each check exits `1` for a
defect it found and `2` for "nothing was verified" — a missing dependency, an
empty page list, a `DIST` that is not there — and the runner keeps them apart:

| exit | meaning |
|---|---|
| 0 | every requested check ran and passed |
| 1 | a check found a real defect — this is the one to fix |
| 2 | everything that ran passed, but something did not run |

A `2` names what skipped and why. It matters most for `contrast`, the WCAG
check, whose `axe-core` is the one dependency Playwright does not bring: on a
machine without it that check skips, and until 2026-08-31 the run reported
`1 of 6 checks failed: contrast` instead — a missing npm package dressed as an
accessibility regression, which is the same "absent CI is not failed CI"
conflation `CLAUDE.md` warns about, in this repo's own tooling.

Then serve it and click around:

```
cd platform/pages/dist && python3 -m http.server 8899
```

## Grounding the numbers a page quotes

FAQ and landing copy has to quote the figure the calculator actually shows on
first load — and because that copy becomes the `FAQPage` schema search engines
and assistants read back, a wrong number there is wrong in two places. Two tools
answer "what does this tool compute on first load?", and the split between them
is about fidelity:

```
node platform/pages/venture-defaults.mjs <slug> [...]         # headless, exact where it works
node platform/pages/price-oracle.mjs --dist=dist <slug> [...] # the rendered page, faithful for all
```

`venture-defaults.mjs` reproduces first load without a browser and is exact for
the tools whose inputs live in the markup. It **cannot** be for a tool that
builds its inputs in the DOM — a `STARTING_*` repeater whose rows carry their own
`<select>` defaults, or a kit tool that fills a rate from JS on load — so it
reports it cannot ground those and points here rather than inventing a number.
Verified 2026-08-31: a headless seed reproduction diverged from the rendered
price on `painting`, `siding`, `flooring`, `junk-removal`, `lawn-care` and
`window-cleaning` while matching to the cent on `roofing`, `deck`, `concrete`,
`janitorial` and `moving`. `price-oracle.mjs` sidesteps that by *being* the page:
it loads the built site in a real browser and reads the headline figures back, so
what it reports is what the visitor sees. Use it for a row- or kit-based tool, and
as a check on `venture-defaults.mjs` for the rest. Like the coverage tools it is
report-only — a default that legitimately changes moves these figures, and
pinning them would fail on honest edits. It needs Playwright (not a repo
dependency); the [Driving the customer journey](#driving-the-customer-journey)
notes cover running it from a Claude-on-the-web session.

## Why this exists

GitHub serves **one** Pages site per repository. Before this, the only workflow
that could publish one built `retail-pilot-intel`'s passcode-gated docs app — so
the owner's single Pages-enable flip (`PAGES_ENABLED`, see below) would have put
an internal docs site live and left every finished calculator with no public
URL at all.

`portfolio/DIRECTION.md` says deploy beats another build until a stranger can
reach something. That means the site the flip publishes has to *be* the
products. This is that site: 33 tools at the time of writing, each already
built, tested, and free.

## What gets published

Automatic, not a manifest. A calculator lands on `main` here most days, and a
hand-maintained list would be stale within a week — the new tool would silently
never be reachable. Any venture that grows a browser entry point is published on
the next push to `main`.

A venture is discovered when it has:

| Path | Published at |
|---|---|
| `ventures/<slug>/index.html` | `/<slug>/` |
| `ventures/<slug>/site/index.html` | `/<slug>/` |
| an entry in `ENTRY_OVERRIDES` | `/<slug>/` |

**To keep a venture off the public site**, add its slug to `EXCLUDED_SLUGS` in
`build.mjs` with a comment saying why. Two are excluded today: the agent box
(`portfolio/hosting/README.md` keeps it off the public path) and
`retail-pilot-intel` (passcode-gated internal docs that need a pnpm build and
keep their own workflow).

Not shipped to visitors: test payload, CLI source (`.py`, `.toml`, …),
`VENTURE.yaml`, `README.md`, `package.json`, per-venture `robots.txt` (only the
one at the origin root is read), and `node_modules`. `LICENSE` files are kept.

`foo.test.mjs` is the house convention for a test file, but it is a convention
rather than a rule, so the exclusion also covers `test.mjs`, `test_*.mjs` and
`*_test.mjs` — the spellings `retainage-cashflow-calculator` and
`freelance-retainer-calculator` actually use. Both were being published until
that was fixed. It matches on the whole filename segment, so product code that
merely contains the word (`latest.mjs`, `testimonials.html`) still ships.

## Updates and the changelog: the open book

`updates.mjs` writes two indexed pages on every build, both in the site
header (Updates) and the hub sitemap:

- **`updates/`**: this week in numbers, recently shipped products, research
  and site changes, the research log (`research/*/LOG.md`), what is in
  progress (open pull requests, the open process backlog, what waits on the
  owner), the owner's mission and direction summarised from
  `prompts/goals.md`, and how the development process works.
- **`changelog/`**: every merge to `main` in the last 14 days, by day,
  filed as Tools, Research, Website or Platform & process, each linked to its
  pull request and to the live page it changed. Atom feed at
  `changelog/feed.xml`.

Nothing on either page is typed by hand. The open pull requests are the one
live section: `publish-branch.sh` writes `dev/stats.json` (with
`github.open_prs.recent`, same-repo PRs only) after this build, and the page
reads it from its own origin when it loads. The publish workflow checks out
3,000 commits so the changelog reaches back 14 days with room to spare; a shallower checkout
says how far back it could read.

```
node platform/pages/updates.mjs --out=dist      # just these two pages
node --test platform/pages/updates.test.mjs
```

## What the build fixes up

- **The placeholder origin.** Every venture's `sitemap.xml` and canonical tags
  were written against `https://example.invalid/<slug>/`, because no real origin
  existed. The build rewrites that to the real base URL, so SEO already written
  points at a page that resolves.
- **Links that escape the site.** Several pages link to a file beside the
  venture (`../README.md`) or to CLI source this build does not publish. Under a
  shared origin those become 404s, so the build repoints them at the file in the
  public repository, where the link still answers the question it was there to
  answer. Links that resolve inside the site are left untouched. The build
  prints how many it repointed.
- **Crawlability.** A root `robots.txt`, a `sitemap.xml` index covering the hub
  and every venture, a `404.html`, and `.nojekyll` (without which Pages silently
  drops any directory starting with `_`).
- **The sitemaps themselves.** Each venture's `sitemap.xml` is *regenerated*
  from the pages that actually published, replacing the hand-written one. The
  ventures' own were copied verbatim until 2026-08-26, and three things were
  wrong with them at once: some listed relative `<loc>` values, which the
  sitemaps protocol does not allow and crawlers reject; two were written
  against `…/monorepo-projects/ventures/<slug>/`, a path this site does not
  serve, so all 11 of their URLs were 404s; and most were simply stale, leaving
  70 of 186 pages in no sitemap at all. Generating from the output makes all
  three impossible: a page is listed because it shipped, at the URL it shipped
  to. Nobody has to remember to update a sitemap again.
- **Dead ends.** Every venture page was written as a standalone site, so none of
  them linked to any other. The hub linked down into 33 tools and nothing linked
  back or across: someone arriving from a search result at
  `does-subscribe-and-save-still-pay.html` saw one calculator and had no route to
  the other 32. The build injects a bar at the top of every published page ("←
  All N free tools") and a footer offering four sibling tools — same sub-group
  first, then the rest of the category — plus the hub and the optional sponsor
  link. The sub-group tier matters because "same category" stopped being a
  signal once `trades` reached 110: without it a metal-roof page offered
  whichever four the rotation landed on, and a roofer was shown a music-lesson
  break-even. Now the offer is another roofing, siding, or gutter bid.

  It is injected at build time rather than committed into each venture for two
  reasons. A calculator lands on `main` most days and injection covers each new
  one for free. And venture pages are edited concurrently by other sessions, so
  a nav bar written into ~180 product files would conflict with nearly every
  open branch. Markup is scoped under `.pf-chrome` so it cannot restyle a
  venture's page, and the pass is idempotent.
- **The mobile keypad.** Every calculator asks for thirty to forty numbers, and
  the person entering them is often on a phone at the job site. `type="number"`
  alone does not settle which keyboard opens — on iOS it gives the
  numbers-and-punctuation layout, small top-row keys with no dedicated decimal
  point, rather than the large phone-dial keypad. Not one of the 35 bid
  calculators set `inputmode`, so the build adds it to all 2,664 number inputs
  across 130 pages, choosing `numeric` or `decimal` from each input's own
  `step`: a field that accepts only whole numbers does not get a decimal key
  that would produce a value it then rejects. An input carrying its own
  `inputmode` keeps it, and the pass is idempotent.

  Injected for the same two reasons as the chrome: a calculator lands on `main`
  most days and this covers each new one for free, and an attribute added to
  ~180 concurrently-edited product files would conflict with nearly every open
  branch.

- **A machine-readable catalog.** `catalog.json` lists every tool with its URL,
  category, sub-category, and description — the flat thing an AI assistant
  answering "is there a free tool for X" can fetch in one request instead of
  parsing the hub. `subcategory` is present only where a category is
  sub-divided, so a consumer filtering on the key never meets an empty value;
  it is what lets "a gutter bid calculator" be answered by a filter rather than
  by reading 110 trade descriptions. The
  deploy workflow also reads it back off the live origin to pick the product page
  it verifies, so a renamed venture cannot make verification pass vacuously.

- **`search-index.json`.** What the hub's search box (and the site assistant)
  ranks: every tool, research project, guide or comparison page inside a tool,
  blog post, and `c/` or `compare/` collection page. A "vs" page that a
  `compare/<product>/` page already gathers is left out, so "jobber" returns
  that one page rather than 43 identical rows. Fetched on the first keystroke,
  never on a bare visit. See `renderSearchIndex` and
  [`docs/reports/2026-10-24-site-search-and-breadcrumbs.md`](../../docs/reports/2026-10-24-site-search-and-breadcrumbs.md).

- **`llms.txt`.** The same catalogue as Markdown, at the well-known path an
  assistant looks for ([llmstxt.org](https://llmstxt.org)). `catalog.json` is
  richer but nothing points at it — a model has no reason to guess the filename,
  and `robots.txt` has no directive that would name it — so a portfolio whose
  growth plan is organic search and AI discovery needs the conventional path
  too. It carries each tool's *full* meta description rather than the trimmed
  card copy, for the same reason the hub's search indexes the full text: the
  trimmed version drops most of what the longer-described tools say about
  themselves. `check.mjs` fails the build if a published tool is missing from
  it, or if it names one that did not ship.

- **`feed.xml`.** An Atom feed of tools as they are published, newest first,
  capped at the 40 most recent. Every other surface here answers *what exists*;
  this is the only one that answers *what changed*, which is the question every
  distribution channel the portfolio is allowed to use actually asks. Ad spend
  is ruled out by `portfolio/DIRECTION.md` and posting into communities
  ourselves is ruled out by `gitops/agents/workers/mandate.md`, which leaves
  channels people opt into — readers, aggregators that poll, and the glue a
  niche community's own moderators run. A feed is the one asset that lets
  someone else do the distributing. It is also the only surface that gives a
  *returning* visitor a reason to come back, since the tools themselves are
  single-use by design.

  Entry ids are `tag:` URIs keyed on the slug, not on the URL, so serving the
  same build from GitHub Pages and from the Hetzner ingress — which
  `portfolio/hosting/README.md` says may both happen — does not mint two ids
  per tool and double every subscriber's feed. `<published>` and `<updated>`
  are equal and never move: these pages are edited constantly, and republishing
  an entry on every edit would make the feed a changelog of our commits rather
  than a list of tools.

### Where the launch dates come from

`feed.xml` needs a date per tool, and the obvious source — `git log
--diff-filter=A -- ventures/<slug>` — is unavailable where it matters. The
in-cluster build clones `--depth 1` (`gitops/prod/portfolio-site.yaml`), so the
build container has one commit and no history.

So the dates are derived once on a machine that has the history and committed
to `platform/pages/launched.json`. After landing a new tool:

```
node platform/pages/launched.mjs --write     # or without --write to preview
```

The refresh only *adds*. A slug that already has a date keeps it even if
history now says otherwise (a rename, a move, a squash) — a feed whose entries
change date retroactively re-notifies every subscriber about tools they have
already seen, and being quiet when nothing is new is the whole value of
publishing one.

Two things stop the file going stale, because a tool missing from the feed is
invisible in a way nothing else in the artifact shows — its pages, sitemap
entry and `llms.txt` line are all fine:

- `launched.test.mjs` fails if any discovered surface has no date, so the gap
  surfaces in a unit run rather than after a 23-second build.
- `check.mjs` refuses to publish an artifact whose `catalog.json` has a tool
  with no `launched` date. It reads the dates back out of the artifact rather
  than out of the repo, so the check still means something when run against a
  downloaded build.

## Everything this build injects is a file

The passes above add the same navigation, the same two bands and the same
keyboard-access sweep to every page. For a long time each of them wrote its
CSS and its JavaScript *into* the page, which is the obvious thing to do when
a venture is a standalone site — and became the wrong thing to do the moment
there were 442 of them under one origin. Measured on the built site:

| Asset | Size | Pages | Written into the site |
|---|---|---|---|
| `pf-chrome.css` | 2.75 KB | 442 | 1.19 MiB |
| `pf-jobs.css` | 5.44 KB | 237 | 1.26 MiB |
| `pf-rates.js` | 7.55 KB | 106 | 781 KiB |
| `pf-site.js` | 1.66 KB | 442 | 715 KiB |
| `pf-rates.css` | 1.78 KB | 105 | 183 KiB |

**4.1 MiB of a 25 MiB site, all of it the same bytes.** `pf-jobs.js` was
extracted first (above) on exactly this arithmetic; these five are the rest of
it. Each is now written once at the site root and linked from the pages that
need it: the site is 25 MiB → 21 MiB, and the opt-in offline bundle 14.85 MiB →
12.58 MiB against its 16 MiB budget.

What a visitor actually gets from that is not the total. It is the *second*
page: a contractor comparing a deck bid against a fence bid used to re-download
~18 KB of identical chrome, band styling and script on arrival, and now
downloads none of it. That is the journey the shop-rates bar exists to serve.

Three things this changes, each of which is a way to get it wrong:

- **A shared asset can be a 404 where an inline one could not.** These pages
  are served at two depths — `/<slug>/` and `/<slug>/some-question.html`, which
  is where search traffic lands — so every `href` and `src` is built from the
  same `toRoot` the chrome and the favicon use. `build.test.mjs` resolves each
  one against the file it is written into and requires it to land on the site
  root; `check.mjs` counts the same references as links, so a wrong path fails
  the artifact rather than shipping an unstyled band.
- **The offline bundle has to know about them.** What was inline was cached
  with the page for free. `collectOfflineBundle` names all six shared files
  explicitly — a tool cached without `pf-jobs.css` opens with the band as
  unstyled markup, and without `pf-rates.js` with no bar at all.
- **A per-page value now travels through the DOM.** `pf-rates.js` needs to know
  which of the four shop-rate fields this tool carries and what each is called
  here, so the pairs ride on the tag as `data-pf-rates-fields`
  (`hourlyWage:operatorWage,…`) and the script resolves each id against its own
  constant table. A pair naming a field the build does not know is dropped
  rather than trusted, and an empty list removes the bar instead of drawing one
  that saves nothing — the same re-check `pf-jobs.js` applies to its amount
  selector, for the same reason. Everything a field *means* — its label, its
  units, its ceiling — stayed in the script, because none of it was ever
  per-page. `pf-site.js` carries the slug it counts the same way, as
  `data-pf-slug`.

The stylesheets need none of that: nothing in them was ever per-page, which is
what made the chrome's palette-free rules (`color:inherit`, neutral greys) worth
having twice over.

One consequence worth knowing about the tests. Several of them read a rule or a
line of script out of a built page and skipped a page that did not carry one.
Once the block moved to a file, those `continue`d over all 442 pages and passed
without asserting anything — the gate-that-never-opens shape this repo keeps
re-learning. They read the shared file directly now, and count the pages that
link it separately.

## How the hub is organised

Two levels, both derived from the slug in `build.mjs` — there is no manifest to
keep in step, for the same reason venture discovery has none.

`CATEGORY_RULES` gives the `<h2>` sections. `SUBCATEGORY_RULES` sub-divides a
section that has outgrown one list; only `trades` has them today.

That second level exists because `trades` reached **110 of the 161 tools**: an
alphabetical wall from `artificial-turf` to `window-replacement` in which a
roofer looking for the metal-roof calculator had to read past sixty trades that
were not theirs. Search finds a tool you can already name. A directory also has
to work for the visitor who is browsing, and browsing 110 undifferentiated cards
is not browsing. The eight families — roofing, openings, MEP, interior, site
work, landscape, cleaning, and getting paid — put the largest at 19.

Both levels are keyword tests rather than slug lists, deliberately. A bid
calculator lands on `main` most days, and a hand-maintained list would silently
drop each new one into the catch-all within a week. Two consequences:

- **Order matters.** The first matching rule wins, so a narrow rule precedes a
  broad one it overlaps: `window-cleaning-bid-calculator` is cleaning work, not
  a window replacement, and its rule has to run first.
- **The catch-all is a net, not a bucket.** A trade slug no keyword claims falls
  to "More trade bids", and `build.test.mjs` fails when anything lands there.
  The fix is a keyword; the test is how anyone finds out one is needed.

### Pages by trade or business (`c/for-<who>/`)

A category is filed by the job a tool does; a searcher names themselves:
"free tools for roofers", "Etsy fee calculator", "how to price a dog grooming
business". `audiences.mjs` lists those people (roofers, plumbers, Etsy sellers,
landlords, food businesses, creators, farms and so on), each with a slug
keyword rule, a title in the searcher's words, an intro, and a note for someone
deciding whether to *start* that kind of business, since "what should I
charge" is the first thing they search. The build writes one page per audience
under the category prefix, so `check.mjs` holds it to the category-page
contract (hub link, disclaimer, only shipped tools), and lists it in
`sitemap-hub.xml`. The hub, the `c/` index and every category page link every
audience page, and each tool's footer links the audiences that claim it ("More
free tools for roofers →").

Unlike categories, a tool may belong to several audiences, so every rule is
tested on its own. Rules anchor on slug word boundaries where a bare keyword
hides inside another word (`pet-` in `carpet-`, `tutor` in `statutory`);
`audiences.test.mjs` pins those cases. An audience matching fewer than
`MIN_AUDIENCE_TOOLS` (4) tools is not published: a "free tools for X" page
listing two tools is a doorway page, not an answer. The root `README.md` links
every audience page, and a test keeps that list in step with `AUDIENCES`.

### The contents index

Grouping alone does not shorten the page. The hub is **36,400px — 43 screens —
at 390px wide**, and the trades section spans 28 of them: the only route to
"Compliance checks" was scrolling past every trade card above it, and the only
alternative was a search box that needs the visitor to already know the tool's
name. The person reading this is often a contractor standing on a job site.

So the hub carries a contents index under the search box, listing every section
and every trade family with its count — the whole catalogue's shape in about
500px on a phone. It is **plain in-page anchors**, so it works before the script
runs and for a visitor who blocks it; `build.test.mjs` asserts every fragment
resolves to a real element id, because a stale anchor fails silently. It hides
while a search is active: its counts are of the whole catalogue, and leaving it
over a filtered page would state a number the page below contradicts.

It uses CSS multi-column rather than grid. One section holds eight sub-groups
and the rest hold none, and grid sizes every cell in a row to the tallest, which
left four columns of white space beside trades.

### Ranking, not just filtering

Search used to hide the cards a query missed and leave the rest exactly where
the build wrote them — which is alphabetical inside a sub-group. That reads
fine at four hits and fails at twelve. Measured against the built site:

| Query | Led with (before) | Leads with (now) |
|---|---|---|
| `roof` | Chimney Sweep, Dryer Vent, Gutter Cleaning | Roofing, Flat Roof, Metal Roof |
| `doors` | Delivery App Margin, Shopify Fee | Entry Door, Garage Door, Interior Door |
| `concrete` | Stair Lift | Concrete, Concrete Lifting |
| `tile` | Basement Waterproofing, Skylight | Kitchen Tile Backsplash, Flooring |
| `windows` | No-Show Fee | Window Cleaning, Egress Window |

In every one of those the tool the visitor had named by name was on the page
and below the fold — on a 390px phone they met three wrong answers and no
right one, which is indistinguishable from the tool not existing.

`searchScore` weights a query word found in the tool's **name** at four times
the same word found in its description or aliases, sums that over the query's
words, and adds a sub-1 tie-break favouring the shorter name (so `roof` reaches
Roofing Bid Calculator before Metal Roof Bid Calculator). Ties fall back to
catalogue order, which the sort is stable in. Cards carry `data-name` for the
name half; the function is injected into the hub by `.toString()` for the same
reason the stemmer is, and `build.test.mjs` pins the shipped text against the
export.

Ranking **reorders siblings in place** — cards inside their list, sub-groups
inside their section, sections inside the page — rather than moving matches
into one flat results list. A card therefore never leaves the heading that
describes it, so the outline a screen reader walks stays the one the markup
built, and clearing the box restores the catalogue exactly.

Ranking cannot rescue a query that matches nothing. Two of the fixes above are
aliases rather than weights: `shingle` and `asphalt shingles` returned **zero**
results while `roofing-bid-calculator` sat there, because that tool's copy is
written in the trade's vocabulary (`reroof`, `squares`, `pitch`, `tear-off`)
and never in the material's. Same for `grass` against the sod and lawn-care
tools, `dumpster` against junk removal, and `ac` against the two cooling tools.

### The dead end a typed sentence used to hit

The matcher ANDs across query words, which is what keeps `ebay return` precise
— and what turns a sentence into nothing at all. Probed with 22 phrasings a
visitor would actually type, **13 returned zero results** while the right tool
sat there, because one word of the sentence is in no index:

| Query | Before | Now leads with |
|---|---|---|
| `new roof estimate` | *nothing* | Roofing Bid Calculator |
| `tree removal quote` | *nothing* | Tree Service Bid Calculator |
| `freight class calculator` | *nothing* | LTL Freight Class Estimator |
| `snow plowing seasonal contract` | *nothing* | Snow Removal Bid Calculator |
| `concrete patio cost per square foot` | *nothing* | Concrete Bid Calculator |
| `commercial janitorial square foot price` | *nothing* | Janitorial Bid Calculator |
| `charge for a mobile detail` | *nothing* | Mobile Detailing Bid Calculator |

`estimate`, `quote`, `class`, `seasonal`, `price` — one such word is enough.
Requiring the visitor to guess the indexed keyword is the hub's job, not
theirs.

So when nothing matches every word, the strict answer stands as the none it is
and the page offers the best partial matches instead of a dead end: scored by
`searchScore`, capped at `CLOSEST_LIMIT` (8), and labelled **"No tool matches
every word. Closest N:"** — presenting near-misses as matches would be its own
wrong answer. A query no tool answers (`locksmith rekey`) keeps the honest
empty state.

It also runs on the mirror-image failure: **a sentence that matches exactly one
tool by accident**. `how much to charge to install a water heater` returned the
*boiler* calculator alone — it happens to use every content word somewhere in
its copy, and the water-heater calculator does not say "install". One confident
wrong answer is worse than none, so the shortlist fires when nothing that
matched carries a query word in `data-strong`: the tool's name plus its
aliases, the words a person deliberately gave it. A tool nobody named and
nobody aliased is a coincidence, not an answer, and the label says so — "No
tool is named for that. Closest N:".

Three constraints on that fallback, all measured rather than assumed:

- **Aliases have to count as named.** An earlier version tested the name alone.
  An alias exists precisely *because* the word is not in the name, so that
  version demoted `air conditioning` (8 results led by Stair Lift) and `asphalt
  shingles` (Roofing pushed to third) — both of which were being answered
  exactly, both by alias. Hence `data-strong`, kept apart from `data-name` so
  an alias never earns the name weight in the ranking itself: reach and
  relevance are different claims.
- **Only when it offers something the strict pass did not.** For a one-word
  query the two sets are the same by construction, and labelling an exact
  answer as approximate would be the page lying about its own result.
- **Scored at a token boundary**, even where the loose pass is in force. That
  pass exists so a half-typed word still matches; reused for ranking it scores
  `air` inside *stair*, *chair* and *repair*, and the shortlist fills with the
  wrong trade — measured, it put the stair-lift and wheelchair-ramp calculators
  above the two cooling tools.

### Catalogue stopwords, derived rather than listed

`SEARCH_STOPWORDS` is generic English. `catalogueStopwords` is the domain half,
and it is **computed from the built catalogue** on every build: a word in at
least `CATALOGUE_STOPWORD_SHARE` (35%) of tool indexes cannot narrow a search.
At 164 tools that is `see` (70%), `away` (59%), `charge` (54%), `much` (52%),
`special` (43%) and `not` (37%) — house phrasing ("see what a 5× special
costs", "what to charge") rather than anything a visitor is looking for. The
next word down is `number` at 32%, so the exact cut is not load-bearing.

Derived, because the copy changes every time a tool ships and a hand-written
list would be describing last month's catalogue. It matters because the matcher
ANDs: a word in half the indexes costs nothing, but that same word can exclude
the one tool whose copy happens not to use it. Dropping `much` and `charge`
turns `how much to charge to install a water heater` into `install water
heater`, which the closest-match pass then answers with the Water Heater
Replacement Bid Calculator instead of the boiler.

**A word that appears in any tool's name is never a stopword, however common.**
That rule is what makes the cut safe: `quote` is in three names (Notary Trip
Quote, Translator Project Quote, 3PL Quote Normalizer) and `rate` in one, so
neither can be dropped and searching a tool by its own name keeps working.
Without it a frequency cut would quietly delete tools from the search — the
worst possible outcome for the box that exists to find them. `build.test.mjs`
pins both halves: every derived stopword is gone from every card's index *and*
present in the page's query filter, and no card's name word is ever in that
filter.

An alias key is matched against the slug's `-`-separated words as a contiguous
run, not as a raw substring. That is a fix, not a refinement: a substring test
reads the slug as one string and cannot see where a word starts, and
`basement-waterproofing-bid-calculator` **ends** `…roofing-bid-calculator` — so
under the old matcher the shingle words landed on the French-drain calculator
and `shingle` returned a basement tool. Nothing about that failure is red.

Categories are also what `relatedTools` and the machine surfaces read, so a
mis-filed tool is not only badly placed on the hub — it is offered to the wrong
visitor at the foot of every sibling page, and described to assistants under the
wrong heading in `llms.txt`. Five tools were filed in "More free tools" until
2026-08-27 for want of a keyword, `tiktok-shop-fee-calculator` among them: a
marketplace tool a seller would only have found by searching for it by name.

## The hub's motion and showcase

The front page's hero, moving tool shelf and "See it working" section live in
`showcase.mjs`, apart from the hub's search and saved-bid code in `build.mjs`.

- **Hero:** a dark backdrop (in both colour schemes, with its own tokens so the
  search and stats keep their contrast), drifting colour, a canvas of points
  that lean toward the pointer, a rotating "Built for …" line taken from the
  audience pages, and stats that count up once seen.
- **Shelf:** two rows of tool names from every section, scrolling in opposite
  directions; the loop copy is `aria-hidden` plain text, not links, so each
  tool is linked once.
- **Showcase:** a muted screen recording of real tools loading their own worked
  examples, and a strip of stills that each link to the tool. The files are in
  `showcase/`, made by `node showcase/capture.mjs` against a locally built site
  (instructions at the top of that file). Rerun it when a tool's look changes.
  The hub drops any still whose tool is no longer published.

Every effect is added by script to markup that is already complete, so the page
works without JavaScript. Under `prefers-reduced-motion: reduce` nothing moves
and the video waits for a click. The video is not fetched until it is on screen.
Scroll reveals hide only what starts below the fold and show everything after
four seconds or on print: until 2026-10-21 they hid every section until it was
scrolled to, so a full-page capture (and any renderer that does not scroll)
saw a page of empty bands.

The sections below the hero live in `home.mjs`, in this order: how it works
(three steps), who it is for (the audience pages), the category tiles (each
with a hand-drawn inline SVG icon in its section's accent), apps and
command-line tools, the showcase and featured tools, the research band (dark,
like the hero: featured projects with their theme and summary, and every
theme), the latest writing, and "also here". The saved-bid restore panel sits
with the offline panel near the foot, not above the tools. `home.mjs` also
writes the hub's second JSON-LD block: a `WebSite` with a `SearchAction` on
`?q=` (which the hub's search reads on load) and the `Organization`. Every
graphic is inline SVG or CSS; the section adds no request.

## Shop rates, carried between tools

`rates.mjs` injects a small bar under the site nav on every **trade bid
calculator** — 36 of them at the time of writing. It carries four fields, and
only these four:

| Field id | What it is |
|---|---|
| `hourlyWage` | crew hourly wage |
| `burdenRate` | payroll burden, % |
| `overheadRate` | overhead on direct cost, % |
| `targetMargin` | target net margin, % |

Those are facts about the contractor's *business*, not about the job, and they
do not change between a door job and a crown-molding job. Every calculator
nonetheless opened on a stranger's ballpark, so the second tool someone crossed
to made them look up and retype the same four numbers — on a page that meanwhile
showed a price computed from someone else's shop. That is the worst place on the
site to lose a visitor: the moment they were about to become a returning user.

Save them once, and every trade bid calculator here opens with them. One
`localStorage` key (`portfolio-shop-rates`) on this origin, which is the only
reason the feature can exist at all — before the single-site build there was no
shared origin to keep it on.

**What is never overwritten.** A field named in the page's URL fragment (or a
leftover query string) came off a *bid link* someone sent. Those are the
sender's numbers on the sender's job, and replacing them would price a
different bid than the sender saw — the exact failure `share.mjs` was written
to avoid. Bid links live in the fragment so wage and margin never hit the
server log or a Referer. The bar says so and offers a button instead.
Everything else is overwritten, including the copy in this browser's own saved
bid: that copy is a snapshot of what the rates were, and the saved rates are
what they are now.

Injection is build-time for the same reasons the nav is (above): a bid
calculator lands on `main` most days, and the same four-line edit committed into
36 product files would conflict with nearly every open branch. A page gets the
bar only if all four fields are present, so marketplace tools and the deep SEO
pages are left alone. `rates.test.mjs` fails if any venture renames one of the
four — otherwise the bar would silently stop appearing on that tool.

Counting reuses the site convention: `shop_rates_saved`, `shop_rates_applied`,
`shop_rates_opened` and `shop_rates_cleared` in `portfolio-hub-usage`, local
only, silent under DNT/GPC and the site-wide opt-out. The prefill deliberately
does not fire the venture's own `bid_calculated` event — a page that loaded is
not a bid someone priced.

## Saved bids

`jobs.mjs` keeps a finished bid, so the tool still has it when the customer
calls back. Where the rates bar carries the four numbers that describe the
*business* across tools, this carries the many numbers that describe one *job*,
and deliberately never crosses tools.

The gap it closes is the second half of a bid. `platform/proposal` made
Tuesday — measure, price, hand over a printed proposal — a finished document.
Friday, when the customer rings back asking what the number was and what it
looks like without the tear-off, the tool was a blank form. `share.mjs` could
already encode a bid into a URL fragment, but only for a contractor who thought
to copy that link somewhere first, and nothing on the page ever said they
should.

**The script is one file, `pf-jobs.js`, written once at the site root.** It was
inlined into every page carrying the band until it was not affordable: ~15 KB
written out 234 times is 3.26 MiB of the built site, and 2.06 MiB of the 16 MiB
offline bundle, all of it the same bytes — paid for on every page load and again
by every tool a contractor saves for a jobsite. Extracting it took the bundle
from 15.42 MiB to 13.39 MiB. The two things the shared script cannot know until
it is on a page — the venture's slug, and which element holds that tool's
headline figure — ride on the `<script>` tag as `data-pf-jobs-slug` and
`data-pf-jobs-amount` and are read back from it; the selector is re-checked
against the shape this build writes, because it now travels through the DOM
rather than being a build-time literal.

It stays `type="module"` for the reason it was one when it was inline: module
scripts are deferred and run in document order, so this one — last in the
document — sees a form the venture's own deferred module has finished building.
A classic external script would run the moment it arrived.

The rest of what this build injects is extracted the same way — see [Everything
this build injects is a file](#everything-this-build-injects-is-a-file).

Every field on the page is saved together under a name the visitor types, and
restoring puts the whole job back. Because a bid never crosses tools, no field
needs its meaning reviewed the way a shared rate does — which is why this
reaches 234 pages against the rates bar's 103. Excluded: `usageOptOut`, which
is a fact about the browser rather than the job, and anything the chrome itself
injects.

`usage` is the same checkbox under the other spelling this repo uses, and it was
not excluded until 2026-08-29. Fifteen published pages name it that way and ten
of them carry this band, so on those a restore had been writing the visitor's
counting preference out of a saved document — including switching counting *on*
for someone who had left it off, which is the direction that matters. Both
spellings are excluded now. One consequence worth knowing: a page whose only
other saveable fields were two real inputs no longer clears
`MIN_SAVEABLE_FIELDS`, so `contractor-bid-readiness` loses the band it only ever
had because the privacy checkbox was being counted as a third bid field.

**A restore is atomic or refused**, and that rule shapes the module. The
itemised calculators build their inputs at runtime, so a bid saved with four
rooms can meet a form with one. Writing back only the fields that still exist
would leave a real, plausible, *smaller* job on screen — the same defect as the
bid link that silently dropped `quantity`, where the recipient priced something
the sender never saw. So the saved field set is compared against the form's
current set, in both directions, before anything is written: fewer fields than
saved means part of the job is missing, more means the form carries rows the
bid never priced. Either way the form is left untouched and the band says which
way it differs. `restoreMismatch` is exported so that rule is tested as a pure
function rather than only through a browser.

Bids are keyed by slug and capped at 25 per tool, oldest dropped. Saving under
a name already used replaces that row, which is the common case: the same job
re-priced without the tear-off. The band is `display:none` in print — it lists
customer names and street addresses, and the proposal sheet exists so a
homeowner receives their own price and nothing else.

**The feature names itself in the structured data.** `featureList` is what a
search engine and an answer engine read when someone asks for something that
keeps a contractor's quotes, and #1894 is the precedent: the customer proposal
shipped on 100 calculators naming itself in none of them, so the portfolio's
largest feature was invisible to the only channel that brings these tools
traffic. `addSavedBidsClause` appends one phrase, and it is called *from*
`injectSavedBids` once the band is known to be going in — so the claim and the
feature ship in the same statement and a page can never advertise saved bids it
does not have. That coupling replaces the separate reverse-direction test the
proposal needed. 196 pages declare it; the 38 that carry the band without a
`featureList` are skipped rather than given a JSON-LD node they never had.

Two shapes to know before scripting against this data, both of which produced a
false reading for #1894: the repo uses both `"featureList":"…"` and
`"featureList": "…"`, and `ev-charger` nests its node under `@graph`. Match on
`"featureList"\s*:\s*"` and walk the parsed tree.

Counting is the same convention: `saved_bids_opened`, `bid_saved`,
`bid_restored`, `bid_deleted` and `bid_restore_refused` in
`portfolio-hub-usage`, local only, silent under DNT/GPC and the site-wide
opt-out. The names never reach the counter. `bid_restored / bid_saved` is the
reading that matters — whether a saved bid is actually returned to.

### Finding the bid again: the hub's index

Bids are saved per tool and restored per tool, and that does not change — the
form a bid was priced on is the only form it fits. What was left over is the
other half of the same question. A contractor saves "14 Oak St — Mrs Reid" in
the gutter calculator on Tuesday. Friday the customer rings back, and the only
route to that bid was remembering which of 162 tools priced it, opening it, and
opening the band. The store is a single `localStorage` key on one origin, so the
hub has held the whole list since the feature shipped and showed none of it.

So the hub carries **Your saved bids**: every saved bid across every tool,
newest first, each row naming the job, the tool that priced it, and the date.
The link is `/<slug>/#pf-jobs` — the band's own anchor, which is why
`JOBS_MARKUP` carries an `id`. Landing on it opens the panel and scrolls it into
view, so the visitor arrives at their bid list rather than at the top of a
calculator. `savedBidIndex()` is exported from `jobs.mjs` and tested as a pure
function; the hub's script is a transcription of it into a page that cannot
import.

Four rules the tests pin, each of which was a way to get this wrong:

- **A bid name never reaches the URL.** It is a customer's name or their street
  address, and a fragment lands in browser history and in anything the visitor
  shares. The link carries the slug and the anchor, nothing else. The name is
  never counted either — `saved_bid_index_shown` and `saved_bid_followed` say
  how often the index is used and never for what.
- **Stored values are text, and slugs are validated.** Any page on this origin
  can write the key, so a slug is used only in the shape the build produces
  (`querySelector` and `href` are both built from it) and a name is written with
  `textContent`. A stored name that is markup renders as the characters typed.
- **A withdrawn tool is not linked, and its bids are not deleted.** A slug the
  hub is not showing would link to a 404, so the row is skipped — but
  `parseStoredBids` deliberately keeps unknown slugs, and the hub is a reader.
- **The list never cuts silently.** Eight rows are drawn; a contractor keeps up
  to 25 bids *per tool*, so a busy one crosses that easily. Past eight the
  section says "Showing the 8 most recent of N saved bids" and offers "Show all
  N". A silent stop would contradict the copy above it ("bids you saved in any
  tool"), and someone looking for a job from three weeks ago would read the
  absence as the tool having forgotten it. `N` counts only rows the visitor
  could actually open — the withdrawn-tool filter runs before the cut, not
  after.
- **The counting opt-out does not empty this list**, unlike "pick up where you
  left off" above. That row is derived from counts and genuinely has nothing to
  show without them. These are the visitor's own saved documents; the tool pages
  show them to someone who has opted out, and the hub hiding them would read as
  data loss. Only the two events are gated. The section is `display:none` in
  print, for the reason the band is.

### Which quotes have gone quiet, across every tool

The chase line — *"The 5 bids you have heard back on came back in 2 to 9 days.
2 still waiting have been out longer than that."* — shipped on the tool pages
and is the one reading in the portfolio a contractor should act on **today**.
The hub now carries it too, and that is not a duplicate: it is the only place
it usually exists at all.

`responseWindow` needs three answered bids. Bids are kept **per tool**, so a
one-truck contractor working six calculators has three answers in *total* and
one in each — the line is blank on all six pages while the signal sits there in
the store. Pooling is sound here for a reason that is specific to this reading:
a reply time is a fact about the contractor's own customers and their own
follow-up, not about a trade or a price level. The price band is the opposite
case and deliberately stays per-tool — `priceBandSentence` compares dollars,
and a gutter bid against a deck bid is not a comparison. `build.test.mjs`
asserts the hub does **not** carry it.

The hub had in fact been shipping `chaseSentence` in `BID_FOLLOW_UP_HELPERS` on
every visit since the feature landed, and could never run it: `savedBids()`
built its rows without `decidedAt`, the one field `bidResponseDays` reads, so
the function returned `''` forever. Nothing failed, nothing was untested, and
the code was simply unreachable — the same shape of defect as the hand-copied
`normalizedBid` above, arriving through the row shape instead of through a
paraphrase.

**Counting is only half of it.** The sentence could always say *how many* quotes
had gone quiet and never *which*, leaving the contractor to hold "9 days" in
their head and check every row's age against it. So the window is now a value
(`responseWindow`) that both the sentence and the rows read, and a row that
`isQuietBid` marks carries the word **Chase**:

- **Strictly longer than the slowest answer, never equal to it.** A bid out
  exactly as long as the slowest reply this contractor ever got has not yet
  outlived it, and the sentence counts it the same way. The two cannot disagree
  — a test pins that the number in the paragraph equals the number of marks.
- **No window marks nothing.** Below three answers `isQuietBid` is `false` for
  everything, rather than falling back to an industry rule of thumb this
  feature deliberately does not carry.
- **A word, not only a colour.** 180 venture palettes do not agree on a warning
  hue, the hub's flips between light and dark, and a visitor may not separate
  two of them at all. Weight, a border and the word carry it, so it survives a
  monochrome print too.
- **Quiet rows are never hidden by the cut.** This is the defect the marking
  exposed. A quiet bid is an old bid *by definition*, so a plain newest-first
  slice of eight hid precisely the rows the line directly above had just asked
  the contractor to act on: the page said "2 have been out longer than that" and
  then showed eight rows, none of them the two. The drawn set is now the newest
  eight **plus** every quiet row wherever it falls.
- **Order is not resorted around them.** A surfaced row keeps its newest-first
  place rather than being promoted. This section is the index its copy says it
  is — used to find the job whose customer just rang — and reordering it around
  a second purpose would cost the first. The count line says both tiers instead:
  "Showing the 8 most recent of 13 saved bids, plus 2 that have gone quiet",
  because "the 10 most recent" would be false the moment a row older than the
  tenth is on screen.

Counting follows the site convention: `saved_bid_chase_shown` in
`portfolio-hub-usage`, local only, silent under DNT/GPC and the site-wide
opt-out, recorded when the reading *changes* rather than on every render — so
pressing "Show all" is not a second reading. It says how often the line is
shown and never for which customer.

### How the pricing is landing, across every tool

The chase line answers *when* customers reply. `pricingSentence` answers
whether the prices are the problem, and it is on the hub for exactly the reason
the chase line is: the sample is only there once the tools are pooled.

Every money reading in this repository is scoped to one tool, correctly —
`priceBandSentence` and `undercutSentence` both refuse mixed currencies
outright, because there are no rates here and there must never be any. But a
great many of these contractors are not scoped to one tool. A crew that fences,
decks, and builds pergolas works three calculators; four decided bids on each
is a real season's evidence, and every per-tool reading draws nothing on all
three, because each side of each tool sits below its threshold. The contractor
has the evidence and the site shows them none of it.

What makes pooling legitimate is that the quantity is **unit-free**, the same
argument `responseWindow` already makes for days. So this line says percentages
and never money:

- **The mean of the per-bid percentages, never a ratio of summed money.** Each
  bid's "% over the winning price" is computed inside that bid's own currency,
  so a book of dollar and euro bids pools without a conversion. Summing the
  money first is the form that would quietly be adding currencies together, and
  a test pins the two apart on figures where they differ (33% against 5%).
- **Against what the job went for, not against the quote**, because "I was 14%
  over" is read as over *their* price.
- **Three lost bids with a known winning price**, one more than the single-tool
  `MIN_UNDERCUT_SAMPLE`. Those two are the same trade at the same tool; these
  three may be a fence and a bathroom, and further apart is worth one more point.
- **The tool count is named, and dropped at one tool.** "Across 7 bids on 3
  tools" is what tells a contractor this is their whole book rather than a
  verdict on one trade. At a single tool it says nothing about breadth, because
  that is the same book `undercutSentence` already reports in money on that
  tool's own page.
- **A gap that rounds to nothing is not reported as parity.** 0.4% over is a
  real gap; "0% over" would read as measured parity, so it is said as the bound
  it is: "came within 1% of what they went for".
- **Losing to a dearer bid is said as loudly as losing to a cheaper one.** It is
  the finding that stops a contractor cutting a price that was never the
  problem, and the one a cheaper quote cannot fix.

The hub ships the percentage half of that code and not the money half
(`BID_PRICING_HELPERS`, not `BID_PRICE_BAND_HELPERS`): `priceBandSentence`,
`undercutSentence`, `bidPriceSide` and `formatBidAmount` are never called here,
and shipping them to the one page every visitor loads would cost a kilobyte of
the offline bundle for nothing. A test pins that they stay off it.

Counted as `saved_bid_pricing_shown`, on the same terms as the chase line: on
change, local only, no name, no slug, and no figure.

### How often the quotes land

The question a contractor asks before any of the ones above — *how often do I
win?* — and the one the saved-bid feature has been able to answer since it
learned the word "lost" without ever saying it out loud. `winRateSentence` says
it, on the hub only.

Every money reading in this portfolio needs evidence most books do not carry.
`priceBandSentence` needs two won *and* two lost on the same calculator.
`undercutSentence` and `pricingSentence` both need the contractor to have heard
what the job actually went for, which on most lost bids nobody ever tells them.
A win rate needs none of it: a bid marked won or lost is the whole input, so
this draws for a book where every other reading here draws nothing.

- **Counts first, percentage after.** "5 of 13 — 38%" carries its own sample
  size in a way "38%" does not.
- **Pools across tools and currencies without an argument**, more plainly than
  the percentages above: nothing is averaged at all, and a count has no unit to
  convert.
- **Five decided bids** (`MIN_WIN_RATE_SAMPLE`). On four the rate can only be 0,
  25, 50, 75 or 100, and a contractor reading "you win half your work" off two
  answers would be reading noise as a finding.
- **The tool count is named, and dropped at one tool**, exactly as
  `pricingSentence` drops it and for the same reason.
- **The trade the rate comes from is named** when two tools each carry four
  decided bids (`MIN_WIN_RATE_PER_TOOL`) and their rates are 40 points apart
  (`WIN_RATE_SPLIT_POINTS`). This is the half no single tool can produce, and
  it is the one that changes what someone does: told "you win 38%" a contractor
  cuts prices across the board; told "4 of 5 on fences, 1 of 6 on decks" they go
  and re-cost decks. Four rather than three because the sentence puts that trade
  forward as the thing to fix, and on three bids that could rest on one job;
  40 points rather than 25 because at the four-bid floor 25 is a single bid of
  difference.
- **Never a target rate**, in either branch. There is no correct win rate — it
  moves with which jobs a shop chooses to quote at least as much as with what it
  charges — and where the split cannot be drawn the sentence says exactly that,
  which is the finding that stops the across-the-board cut. A test asserts the
  words "should", "aim", "target", "too high/low", "healthy" and "ideal" appear
  in no branch of it.

Counted as `saved_bid_win_rate_shown`: on change, local only, no name, no slug,
no figure, and no tool — which trade someone bids is not something this site
needs to know to tell whether the reading is worth its bytes.

### Whether what you changed is working

Every reading above is a snapshot — a rate, a share, a band, pooled over the
whole book. That is the right shape for *how am I doing* and the wrong shape for
the question that follows it. A book here is accumulated over months, so a shop
that raised its rates in June, or re-costed decks *because* `winRateSentence`
told them to in May, reads a pooled rate that averages the before and the after.
The change they made is not merely invisible in it: it is diluted by exactly the
half of the book it was meant to fix, and the louder the change, the more
thoroughly the snapshot hides it. `trendSentence` is the reading that closes that
loop, on the hub only.

    Fence Bid Calculator has been landing less often than it was: 0 of 6 on the
    6 most recent, against 6 of 6 before them. The recent half starts 70 days
    back.

`winRateSentence` on that identical book says "you have won 6 of 12 decided bids
— 50%", which is true and describes neither half of this shop's year.

- **Inside one tool, never pooled.** A movement summed across trades mixes a
  fence change with a deck change and describes neither; the whole finding is
  *which* trade moved, so the trade is the unit. Only the furthest movement is
  named, with the slug breaking ties, for the reason every reading here names
  one thing: a table of small movements is something to read, and this is
  something to act on.
- **Ordered by `at` — when the bid was priced — not by `decidedAt`.** What is
  under examination is the price, and the price was set when the bid was made.
  An old quote answered late would otherwise land in the recent half and be
  counted against a number this shop no longer charges. `at` is also the field
  `normalizeBid` requires, where `decidedAt` is absent on every bid decided
  before that field existed — so ordering by it would drop rows silently, which
  is the failure mode this feature area has shipped twice.
- **Halves by count, not by calendar.** "The last 90 days" gives an empty half
  to a shop quoting four jobs a month and two halves of wildly different size to
  everyone else, and a difference between 1 of 3 and 5 of 9 is partly just the
  denominators. Equal halves make the counts readable straight across, which is
  the sentence's whole grammar. On an odd count the middle bid belongs to
  neither side rather than being lent to one of them.
- **Four decided bids a side** (`MIN_TREND_PER_HALF`), so eight on one trade
  before this can be read at all — the price of asking about change rather than
  about state. Four is `MIN_WIN_RATE_PER_TOOL`'s floor and rests on the same
  argument: at four the achievable rates are quarters, so the smallest
  reportable gap is two bids wide.
- **Forty points apart** (`TREND_SPLIT_POINTS`), matching
  `WIN_RATE_SPLIT_POINTS` against the same step size: forty admits a gap of two
  bids and refuses a gap of one. One bid of difference is what a single unusual
  job looks like, and a reading that called that a change would send a
  contractor to re-cost a trade that never moved.
- **The turn is dated in days back**, off the oldest bid in the recent half.
  That is a fact about the sample rather than a claim about when anything
  changed, and it gives the reader a period to think about instead of an
  instruction. It is also the one clause needing a helper from another injected
  bundle — `bidWaitingDays` ships with `BID_FOLLOW_UP_HELPERS`, which the hub
  emits above the pricing helpers — so a build test pins that ordering. A throw
  here would take the whole saved-bid section down with it.
- **Never a target, and never a cause.** The second sentence says plainly that a
  slow season or a run of unusual jobs moves this as much as a price does, and
  the same "should / aim / target / healthy / ideal" test that guards
  `winRateSentence` and `keepSentence` guards both branches of this one.

The "every row, not the eight drawn" rule that the readings above follow for
consistency is load-bearing here: the rows the page draws are the *newest*, so
computing this from them would compare the recent half against itself and report
that nothing has changed, on every book, forever. Journey step 6bt drives twelve
bids through a page that draws eight for exactly that reason.

Counted as `saved_bid_trend_shown`, on the same terms as the lines above: on
change, local only, no name, no slug, no trade, no figure — and no direction
either, since which way a shop is moving is not something this site needs to
know to tell whether the reading is worth its bytes.

**The same finding also ships in the panel on each tool's own page**, as
`toolTrendSentence` — "The bids you saved here have been landing less often
than they were: …". The hub is the page a contractor opens when a customer
rings back; the tool page is the page they are on *while deciding what to
charge for the next job*, which is the only moment this reading can still
change an outcome. It names no trade there, because there is only one and
saying it would be telling the reader where they are standing.

Both sentences are built on `trendSplit`, which is the arithmetic alone, so
they cannot disagree about what moved; `trendDetail` writes everything after
the subject once. The two bundles part company at the sentence —
`BID_TREND_HELPERS` carries the tool page's, `BID_PRICING_HELPERS` the hub's —
so neither page pays for the other's, the same rule that keeps the money
readings off the hub. It is the one reading in the panel **not** gated on the
page having a headline figure: it counts outcomes and never reads a number, so
a tool that stores no amounts can still tell its user their quotes have stopped
landing. Counted there as `bid_trend_shown`. Journey step 6bp drives it on
`cleaning-dilution-calculator`, a page with no hero figure at all.

### Which of these trades is worth doing

The three readings above make a contractor better at getting the yes.
`marginSentence`, on each tool page, is the one that says whether the yes was
worth having — but it speaks in money, so it is scoped to one tool, and a crew
that fences, decks and cleans gutters reads three separate margins on three
separate pages. `keepSentence` puts them beside each other, on the hub only.

That comparison is the entire reading, so there is no book-wide total in it. A
pooled "you kept 12%" would need one currency across every tool and, worse, it
would be the average that buries the finding: a shop keeping 30% on gutters and
losing money on decks has a decks problem, and the mean of the two describes no
work they do.

- **Percentages only, and therefore safe across currencies**, on exactly the
  argument `pricingSentence` makes: "this job kept 22% of what I charged" is a
  fact inside one bid's own currency. Money is never printed here, which is what
  makes that honest.
- **Pooled inside each trade** — total kept over total charged, the form
  `marginSentence` argues for — so a $400 job at 50% beside a $9,600 job at 0%
  reads as 2% and not as the 25% the mean would flatter it with. A tool whose
  costed wins are in two currencies is dropped rather than summed.
- **Two costed wins per trade** (`MIN_KEEP_PER_TOOL`), against the four
  `MIN_WIN_RATE_PER_TOOL` asks. A win rate on three bids can only be 0, 33, 67
  or 100 and would be quoting its own step size; a kept share has no step size,
  and two pooled jobs is an exact statement about two real invoices. The job
  count is printed beside every share so the reader sees the sample.
- **Two trades** (`MIN_KEEP_TOOLS`), which is structural rather than
  statistical: at one tool this would be `marginSentence` with the money taken
  out, and the better sentence is already on that tool's own page.
- **Fifteen points apart** (`KEEP_SPREAD_POINTS`) before the gap is called a
  finding, against `MARGIN_SPREAD_POINTS`' twenty. Twenty is the spread between
  two individual jobs, where one machine hire moves an end on its own; these
  ends are pooled over a trade, so that noise has already been averaged out.
- **A trade below its own cost is said plainly and first.** It is the one
  finding here that makes winning more work actively worse, and the reading that
  turns a rising win rate from good news into a warning.
- **Where the trades agree, the honest half is this reading's own blind spot:**
  it can only see the jobs whose costs were typed in, so a trade with none is
  missing from the comparison rather than sitting in the middle of it.
- **Never a share to aim for**, in any branch — the guard `winRateSentence` and
  `marginSentence` both carry, pinned by the same test over every branch.

The hub's `savedBids()` is a hand copy of `normalizeBid`, so this reading needed
`cost` added to that transcription. That is the third time a field has had to
be carried across by hand (after `decidedAt` and `lostTo`) and the failure mode
is always the same: the reading is injected on every visit and returns `''`
forever, with nothing failing anywhere. A build test pins each of the three, and
journey step 6bk drives the whole round trip in a browser.

Counted as `saved_bid_keep_shown`, on the same terms as the three lines above:
on change, local only, no name, no slug, no figure and no trade.

### Getting the bids off this browser

Everything above stands on one `localStorage` key in one browser, and the hub's
own copy said so: *"clearing your browser data clears them."* That sentence was
honest and it was also the whole problem. The portfolio's clearest return-visit
feature had a single point of loss and no way out of it:

- The job was priced on the phone on Tuesday. Friday is at the desk, and that
  laptop's browser has never seen any of it.
- The phone is replaced, the browser reinstalled, or "clear browsing data" is
  tapped to fix something unrelated.
- Safari evicts script-written storage on a site the visitor has not opened for
  seven days. A tool used once a fortnight is exactly that shape.

Each of those ends with a blank form and a customer on the phone asking what the
number was — the failure saved bids exist to prevent, arriving through the
storage instead of through the tool.

`backup.mjs` is the way out that needs no account and no server, because there
is nowhere here to upload to and no wish for one: **a file the visitor holds.**
"Download a backup" writes every saved bid on the device, plus the shop rates,
into `saved-bids-<date>.json`. "Restore from a backup file" reads one back on
any browser on this origin. The Blob never leaves the page; the pure functions
live in `backup.mjs` and the hub's script is a transcription of them, same as
`savedBidIndex`.

Four rules the tests pin:

- **A restore never deletes.** The file is merged into what the device already
  holds, never written over it. Someone restoring last month's backup onto the
  phone that has this week's bids must not lose this week, and cannot be
  expected to know that in advance. Where the same job is on both sides the
  newer `at` wins — the only ordering the data carries. Restoring the same file
  twice is a no-op that says "already here" rather than a list that doubles.
- **Nothing is dropped silently.** Entries the file could not carry, slugs that
  failed validation, and bids pushed past the 25-per-tool cap are counted and
  named in the status line. A list that quietly stops looks exactly like a tool
  that forgot, which is the defect this feature area keeps re-learning.
- **The panel is drawn even with nothing saved.** It sits *after* `#bids`
  closes rather than inside it: `#bids` is `hidden` until there is at least one
  bid, so a restore control nested there would be unreachable on the new phone
  or the fresh laptop — the one browser it exists for. The copy re-words itself
  for that case ("Bids saved on another browser?") and the download button
  hides, because there is nothing to download.
- **Shop rates are restored only where there are none to lose.** They are the
  visitor's own business numbers and every trade calculator prefills from them;
  a restore that overwrote the ones set in this browser would silently reprice
  36 tools from a file. The status line says which happened. The four fields and
  their ceilings are read from `SHOP_RATE_FIELDS`, so a restored rate can never
  be one the calculator would reject.

**The band on each tool page links to it.** The panel lives on the hub, because
the store is site-wide and a per-tool control would either back up one tool's
bids or misleadingly claim to back up all of them. But the person most likely to
want a backup is the one who has just saved a bid they care about, and they are
on a calculator — so without a link they were the one visitor never told it
exists. The saved-bids note has always ended "clearing your browser data clears
it"; it now offers the answer in the same sentence, at `<toRoot>#backup-box`.
`injectSavedBids` takes the same relative prefix the chrome and the favicon are
built from, because these pages are served at two depths and a hard-coded `../`
is wrong at one of them.

A backup file is also the only path by which a string from *outside* the browser
reaches the saved-bid key, so it is the one place slugs are validated on the way
in (`^[a-z0-9][a-z0-9-]*$` — the shape the build produces, and what the hub
later builds a `querySelector` and an `href` from), the file is size-capped
before `JSON.parse` sees it, and a `kind`/`v` mismatch is refused outright
rather than half-imported.

Counting is the site convention: `bids_backup_downloaded`,
`bids_backup_restored` and `bids_backup_rejected` in `portfolio-hub-usage`,
local only, silent under DNT/GPC and the site-wide opt-out. No name, no slug,
no count of what was in the file. `bids_backup_restored` is the reading that
matters — a restore is a visitor who had already lost the bids once, or who
uses two devices, and either is a stronger return-visit signal than a page view.

## Sending a bid to somebody else

`link.mjs` adds **Copy link to this bid** beside Saved bids, on 156 pages that
had no way to hand a priced job to another person. The whole bid rides in the
URL fragment; nothing is uploaded, and the recipient opens the live tool rather
than a flat figure, so "what if we skip the tear-off" is a thing they can try
instead of another phone call.

Fifty-eight pages already did this with a hand-written per-venture `share.mjs`,
which is where the shape comes from and also why this exists. That allowlist
names its fields, so it drifts: a calculator grew `quantity` and `targetMargin`,
the list did not, and a shared link silently dropped both — the recipient
computed a different profit than the sender saw and nothing said so. Here the
field set is read off the form at the moment the link is made, exactly as
`jobs.mjs` reads it for a saved bid, so there is no list to keep in step and a
field added tomorrow rides along with no edit.

**The link carries the sender's headline figure, and the recipient's page
checks its own arithmetic against it.** That check is the point. Every failure
mode ends the same way — two people reading one price and seeing different
money — and silence is what made the `quantity` bug expensive. Three outcomes,
and the page says which:

- **Match.** Fields applied, figure agrees, named in the note. Reprice freely.
- **Applied, figure differs.** Everything was written but this page computes
  something else, so the note names both figures and says not to quote either
  until you know why. The tool may have changed since the link was made.
- **Refused.** The link's field set is not this form's field set, so nothing is
  written and the note says how many fields each way. Writing the overlap would
  leave a form pricing a real, plausible, *smaller* job than the sender sent —
  the same atomic-or-refused rule a saved-bid restore follows, for the reason it
  follows it.

Compared as normalized display strings, not parsed numbers: `parseFloat` would
call `$1,800` and `$1,800.40` equal on every page that renders a thousands
separator, which is exactly the near miss the check is for.

Two build-time exclusions, so the control is never drawn where it would work
badly. **Pages with their own share button** keep it — a second button writing a
second hash format is worse than the drift it fixes. **Pages that build their
fields in script** (the itemised calculators: flooring by room, tree service by
tree) get neither button nor claim, because a recipient's blank form has one row
where the sender had four, the sets can never match, and a link that always
refuses is worse than no link. Both are read from the venture's own markup and
not from the document the build has already written into, so a future band that
injects a control cannot change who is offered the feature.

The fragment is the one part of these pages a stranger writes, so it is treated
as hostile: unknown format version, wrong shape, an id the form would not have
offered (`pf-` prefixed controls, and `usageOptOut`, which is a standing
preference about this site rather than a number in a bid), a value of the wrong
type, an oversized value, or too many fields all drop out before anything
reaches a control. A payload left with nothing is `null`, not an empty apply.

The link is built **on click, never on load** — a hash written eagerly would put
a customer's numbers in the address bar of a contractor who never asked to share
anything, where the browser keeps it in history. The note is not printed: it
says a price came from somebody else, which on a proposal sheet handed to a
homeowner would read as a disclaimer about the number they are being quoted.

Counting is the site convention: `bid_link_copied`, `bid_link_opened`,
`bid_link_refused` and `bid_link_amount_differs` in `portfolio-hub-usage`, local
only, silent under DNT/GPC and the site-wide opt-out. No slug, no field names,
no figures. `bid_link_opened` is the first signal in this portfolio that a tool
reached a *second* person, and `bid_link_amount_differs` is the one to watch: it
is a defect report the visitor did not have to write.

## Pointing at the input that was rejected

103 tools here refuse to price a job like this:

```
Wood privacy, 6 ft: linear feet must be at least 0
check the highlighted input
```

The first line is the hero number, replaced by the message. The second is the
label under it. Measured in Chromium on 2026-08-29 against
`fence-bid-calculator`, **nothing on the page was highlighted**: no
`aria-invalid`, no outline, no focus move. Every one of the 103 pages that
prints that sentence printed it without drawing a highlight; nine of them mark
a field for some unrelated reason, and none marked the field the message was
about.

The cost is not cosmetic. These forms carry twenty to forty numeric inputs and
repeat rows per fence run, per room, per gutter line: `fence-bid-calculator`
opens with 26 visible number fields. A contractor who fat-fingers a minus sign
gets a sentence, an instruction to look at a highlight that does not exist, and
no price — with the offending box usually scrolled off a phone screen. Recovery
from a typo is the second most-travelled path through these tools, and it dead
ended.

`invalid.mjs` reads the message the calculator wrote, finds the field it names,
and marks it — `aria-invalid="true"` plus an outline (an outline, not a border:
a border would reflow the form on every failed keystroke). It invents no
validation of its own; `calc.mjs` remains the only thing that decides what is
wrong. This answers only "which box?", which is the half the message cannot
express and the page already claimed to have answered.

It ships the way everything else here does: two files at the site root,
`pf-invalid.mjs` and `pf-invalid.css`, linked from the pages that promise a
highlight and named in the offline bundle — never written into a venture. The
gate is the promise itself, so a calculator that lands tomorrow carrying that
line is covered on the day it ships, and one that never prints it gets nothing.

Finding the field is text, because there is no other link between a message and
an input:

- The message splits into a **scope** and a **subject** — `Wood privacy, 6 ft`
  and `linear feet` — at the connective (`must`, `cannot`, `has to`, …).
- Every visible control the *venture* owns is scored on how well its label
  answers the subject, in both directions. Recall alone lets a long label win
  by containing everything plus ten other words; precision alone lets `Hours`
  beat `Hours / post` for "hours per post".
- Controls the build injected are skipped by their `pf-` class ancestry. The
  shop-rates bar carries an input labelled "Crew hourly wage", which is exactly
  what a wage message matches.
- The scope breaks the tie between rows: with two runs on the form, breaking
  the second run's linear feet marks `r2-lf`, not `r1-lf`.
- Native validity is **evidence, not an answer**. An earlier version returned
  the page's single natively-invalid control outright, and on a form where one
  unrelated field is already out of range that marked it for every message —
  "Add at least one fence run to price" included. It is now a bonus on the
  score, and the tie-breaker only where the words already brush against that
  control.
- Two wording drifts were measured and are handled by normalisation, not by a
  per-tool table: the form abbreviates what the sentence spells out
  (`Finished top sq ft` / "Finished square feet"), and sometimes the bracketed
  unit is the only word the two share (`Walking surface (sq ft)` / "Deck square
  feet"). So the unit is kept, `sq`/`ft`/`lf` expand, and plurals fold.

**Measured across the whole family** — build the site, serve it, drive every one
of the 103 tools in Chromium, break one numeric field on each and read back what
got marked:

| | before | after |
|---|---|---|
| Tools promising a highlight | 103 | 103 |
| …that marked a field | 0 | 103 |
| …that marked the field actually broken | 0 | 103 |
| …still promising with nothing marked | 103 | 0 |

Focus is never taken: the visitor is usually typing in the field that is wrong,
and stealing focus mid-keystroke eats the next character. The page scrolls to
the field only when no control has focus at all, which is the case where they
cannot see what to fix.

Where no field can be named — "Add at least one fence run to price" is about the
form, not a box — the label stops promising a highlight and reads *check the
values you entered* instead. A promise kept only sometimes is still a promise
broken.

Counting is the site convention: `invalid_field_marked` and `invalid_no_field`
in `portfolio-hub-usage`, one per distinct rejection, local only, silent under
DNT/GPC and the site-wide opt-out. No slug, no field names, no figures. The
second is the maintenance signal: if it grows against the first, some
calculator has started wording its messages in a way the matcher cannot follow,
and those pages are back to pointing at a highlight nobody drew.

## Link previews, icons and the share pass

A shared link is the first thing most people see of the site, so every page
previews as a card of its own (2,282 on the 2026-10-21 build: 1,307 tools, 43
category and audience pages, 931 research, writing, comparison and section
pages, and the site card).

- **`sharecard.mjs`** draws a card in the homepage hero's look (night field,
  teal and indigo aurora, grid, constellation): the brand lockup, the page's
  section as a coloured kicker, its name in Inter, a footer claim and the
  site's address. Cards are median-cut to 256 colours and written as indexed
  PNG, about 50 KB each instead of 150-200 KB truecolour, which keeps the
  artifact to ~120 MB of cards. It also draws the brand mark (three rising
  bars on the header's teal-to-indigo square) used by `favicon.ico` (16, 32
  and 48 px), `favicon.svg`, the app icons and the opaque 180 px
  `apple-touch-icon.png`.
- **`fontraster.mjs`** reads TrueType outlines and fills them anti-aliased,
  with no dependency. The faces are Inter subsets in `fonts/` (SIL Open Font
  License, `fonts/OFL.txt`); `fonts/kerning.py` flattens their GPOS kerning
  into `fonts/kerning.json` and is the one step that needs `fonttools`.
- **`share.mjs`** is the pass that runs after every generator and the chrome:
  any directory page still pointing at the site-wide `social-card.png` gets a
  `share-card.png` beside it (title from `og:title`, kicker from the
  breadcrumb, research pages coloured by their topic's colour on the research
  map), and every page gets complete share tags: `og:site_name`, image size
  and type, `og:image:alt`, and `twitter:title`, `twitter:description`,
  `twitter:image` and `twitter:image:alt`. It also drops a stray inline
  favicon and links `favicon.svg` where a page lacks it. Cards render on a
  pool of worker threads (`share-worker.mjs`); on four cores the build takes
  no longer than before the pass existed.
- The deploy guide and the development pages (`deploy/`, `dev/`) are written
  into the artifact by later workflow steps, so `portfolio-pages.yml` runs the
  same pass over them afterwards: `node platform/pages/share.mjs <dist>
  --base=<site url> --only=deploy,dev`. Pages with no og: tags at all get
  `og:title`, `og:description`, `og:url` and `og:type` from their own head.

To look at a card: `node -e "import('./sharecard.mjs').then(m => process.stdout.write(m.renderCard({headline: 'Example', kicker: 'Section'})))" > card.png`.

## Offline and installable

The people these tools are for are often somewhere with no signal at the moment
they need the number: a contractor measuring in a crawl space, a seller in a
warehouse aisle, a driver at a dock. Every tool is already pure client-side
arithmetic, so the only thing between that user and an answer is fetching the
page — which is what `offline.mjs` removes.

The build emits a service worker, a web app manifest, PNG icons, and an
`offline.html` fallback, and wires every published page to them. Two behaviours:

1. **Anything opened once opens again offline**, automatically, including its
   modules — the worker caches each same-origin GET as it is served.
2. **"Save all tools for offline"** on the hub fetches every tool's entry page
   and modules up front, for someone who knows they are about to lose signal.
   It is a button, never automatic: nobody's mobile data gets spent without
   them asking. The button's copy states the real download size, computed at
   build time from the actual bundle and patched into the hub page — not a
   number typed once and left to drift as the catalog grows. (It did: the
   copy said "about 3 MB" from ~30 tools onward while the catalog reached 174
   and the real fetch reached 16.8 MB.)

A page not saved and not previously opened falls back to `offline.html`, which
says so plainly and links back to the hub.

**Staleness is bounded by construction.** The cache name carries a SHA-256 of
the built site, so a deploy lands in a *new* cache and `activate` deletes every
older one. A visitor is at most one navigation behind and never mixes files from
two builds. The worker itself is never served from cache, so the browser's
update check always sees the real file.

Registration is progressive enhancement: with no service worker support, or a
rejected registration (private mode), every page behaves exactly as before, and
the offline widget stays hidden rather than appearing and failing.

Nothing about this sends anything anywhere. The worker only touches same-origin
GETs; the hub's counting is still `localStorage`-only.

## The availability clause

`PRODUCT_PLAYBOOK.md` §5b requires the no-warranty *and* the no-SLA clause on
every hosted surface. Most ventures write both in their own voice; a few were
authored when nothing here was hosted, so the availability half was moot. It
stops being moot the moment the Pages variable is flipped, so the chrome pass
supplies the clause on any page still missing one — matched loosely, so a
venture that words it its own way is left alone and never given a second,
differently-worded statement. A page added tomorrow cannot ship without it.

## Checking the artifact

`check.mjs` runs over the built directory, not the sources, because that is
where these defects are created — by the copy, not by the input. It fails the
build on a missing root file, a leftover `example.invalid`, a relative link
that resolves to nothing, a link that climbs out of the site root, a product
directory with no landing page, a page in no sitemap, and a sitemap URL that
did not ship. It follows the sitemap index into each venture's sitemap; a check
that read only the root would have passed while every defect above sat one
level down.

The workflow runs it between building and uploading, so a broken artifact never
reaches the live site.

## Checking the sources: the no-warranty clause

PRODUCT_PLAYBOOK.md §5b requires two clauses on every hosted page, and they are
enforced in two different places because the build draws a line between them.

The **no-SLA** clause is about how these pages are hosted, which is this
build's own statement to make, so `build.mjs` injects it into any published
page that lacks one. That requirement holds by construction; no venture has to
carry it, and nothing checks that they do.

The **no-warranty** clause is about what a given tool is not advice *about* —
"not landscaping, construction, legal, tax, or financial advice". Only the
venture can write that, so it cannot be injected, and it stays the venture's to
get right. `clauses.mjs` is what checks it, and it is the one check here that
reads the **sources** rather than the built site:

```
node platform/pages/clauses.mjs                 # every surface
node platform/pages/clauses.mjs <venture-slug>  # one venture
```

Reading sources is what makes it cheap enough to run on every venture PR.
`ventures-tests.yml` runs `node platform/pages/clauses.mjs --changed-since
<base>` for each venture the change touched, naming the venture and
annotating the page; until 2026-10-20 the same check was a step copied into
281 `<slug>-ci.yml` files. That matters because the built-site assertion in
`build.test.mjs` fires on `platform/pages/**` — so a venture that omits the
clause merges cleanly and turns `main` red in the Pages job, naming an author
who never saw the requirement, in a workflow they did not touch. That is how
the no-SLA half kept recurring (#1747, #1763, sewer-line-replace) until
injection retired it; the no-warranty half was left exactly as exposed.

A venture with no browser surface passes trivially, so a CLI or library can run
the same step unconditionally. `portfolio-validate.yml` runs the no-argument
form as a backstop, which is what covers a slug whose workflow was never
created at all — how carpet-install-bid-calculator reached `main` already
inside the Pages build with no CI of its own.

The pattern is deliberately loose: ventures word the surrounding paragraph in
their own voice, and demanding the playbook's exact prose would rewrite correct
pages instead of catching missing ones.

## Driving the customer journey

`check.mjs` proves the files are right. It cannot prove the site *works* — that
search filters, that the opt-out actually stops counting, that a calculator
computes rather than just paints, that nothing throws in the console.
`journey.mjs` drives that in a real browser:

```bash
node platform/pages/build.mjs --out=dist
python3 -m http.server 8793 --directory dist &
node platform/pages/journey.mjs

# or against the live site, once publishing is on:
BASE_URL=https://duncan-haywood.github.io/oss-monorepo node platform/pages/journey.mjs
```

It covers the hub and its grouping, search (narrowing, the empty state, and
clearing), the usage opt-out across a reload, a click through into a calculator
and a computed figure, a cross-product sibling link, a nested product hub, every
URL in every sitemap, the 404, a 375px viewport for horizontal overflow, and two
whole-run assertions: that nothing was fetched off-origin, and that no page,
console, or resource error was raised anywhere except the deliberate 404 step.

**A lone `requestfailed` on a static asset is not yet a finding.** `sweep.mjs`
already warns about the false *pass* — a server left running by an earlier build
keeps the port and the run greens against the old tree. This is the mirror case,
and it costs a detour in the other direction. `python3 -m http.server` is
single-threaded, so under concurrent load it can drop a request that the file
system can serve perfectly well; on 2026-08-28 a run reported `requestfailed:
/icon-192.png` against a build where that file exists and answers `200` to curl.
Before debugging a resource error, ask the server for the asset by hand:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8793/icon-192.png
```

A `200` there means re-run before believing the failure, ideally against a
threading server and with nothing else on the box:

```bash
python3 -c "import http.server as h, socketserver as s, sys
s.ThreadingTCPServer.allow_reuse_address = True
s.ThreadingTCPServer(('', 8793), lambda *a: h.SimpleHTTPRequestHandler(*a, directory='dist')).serve_forever()" &
```

A *reproducible* resource error is still a real defect and this does not excuse
one — the favicon gap below was exactly that, and it shipped for months.

**Serve it under a `/monorepo-projects/` prefix too.** Some defects exist only at
a path, and served from `/` they are invisible:

```bash
mkdir -p sp && cp -r dist sp/monorepo-projects
python3 -m http.server 8793 --directory sp &
BASE_URL=http://localhost:8793/monorepo-projects node platform/pages/journey.mjs
```

A browser with no declared icon asks the **origin** root for `/favicon.ico`.
Served from `/`, the `favicon.ico` this build writes answers that request and
masks a missing `<link rel="icon">`; served from `/monorepo-projects/`, which is
the shape GitHub Pages actually serves, it does not and the page 404s. That gap
is how every page shipped with a failing favicon request until #1746. Run both.

It also **changes an input and requires the output to move**, on one calculator
of each shape. That distinction carries the weight here: every tool ships
worked-example defaults, so money is on the page from the moment it loads and a
"computed a figure" assertion passes whether or not the arithmetic ever ran. A
tool whose `calc.mjs` throws on load renders its form, shows its defaults, and
satisfies every static check in `check.mjs` while being useless to a visitor.
Only a changed input tells the two apart.

If Playwright is installed globally rather than beside this repo, point
`PLAYWRIGHT` at it:

```bash
PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs node platform/pages/journey.mjs
```

Counts are derived from the page, never hardcoded — a venture lands most days,
and a literal would fail on a healthy site the moment someone ships a
calculator.

It is deliberately **not** in CI: it needs Playwright, which is not a dependency
of this repo, and `build.test.mjs` plus `check.mjs` already gate the build. Run
it before claiming the site works, and again against production after the owner
flip. If Playwright is installed globally rather than beside the repo, point
`PLAYWRIGHT` at its module path.

### Sweeping every tool

`journey.mjs` is deep and narrow — the hub, and a few tools in detail.
`sweep.mjs` is the other axis: shallow and total, over **every** published tool.

```bash
node platform/pages/sweep.mjs        # same BASE_URL / PLAYWRIGHT / CHROME_PATH env vars
```

**Run this before claiming the site works.** Until 2026-08-27 it could not run
at all in the form documented here: it destructured `chromium` straight off the
dynamic import, which is `undefined` when `PLAYWRIGHT` names Playwright's entry
*file* (it ships CommonJS, so the exports arrive under `.default`), and it read
the browser override from `CHROMIUM_PATH` while this README and `journey.mjs`
say `CHROME_PATH`. Either mistake ends the run before the first page loads.
`journey.mjs` had already been fixed for the first; this file was missed. The
cost was `3pl-quote-normalizer`, which reached `main` with a module that failed
to parse — the whole calculator inert — which is exactly what this sweep is for.
Both spellings of the browser override are accepted now.

It answers the one question a site assembled from ~60 independently-written
ventures raises: does each one still compute? For every tool it loads the page
at a 390px viewport, watches for page and console errors, changes the inputs,
and requires a response. A tool that only recalculates on a button press gets
its button pressed; a tool whose inputs are pasted text gets its own "load an
example" button pressed first, which is also the shortest path that product has
to first value. A page that arrives with its answer already computed is asked
whether it is showing a result rather than being failed for not changing, and a
page that is only links is reported as such rather than called broken.

That failure mode is silent and this repo has shipped it before: a page whose
markup swallowed its own app script rendered perfectly and did nothing. Under
one origin it matters more, because a visitor arriving from a search result
meets one tool — and if that tool is dead, they have met the whole portfolio.
Exit status is non-zero if any tool fails, so it can gate a release.

### Checking every page can be read

`sweep.mjs` asks whether each tool still computes. `contrast.mjs` asks the
question all three of the checks above can pass while failing: **can a visitor
read the answer, and reach the controls?**

```bash
npm i --no-save playwright axe-core
node platform/pages/contrast.mjs   # same BASE_URL / PLAYWRIGHT / CHROME_PATH env vars
                                   # plus AXE and DIST
```

It loads **every** built page — 440 of them, the SEO articles included, not just
the 164 tool front pages — at a desktop and a phone viewport, and runs axe-core's
WCAG 2.1 A and AA rules. Exit status is non-zero on any violation.

A tool that calculates correctly and paints the answer in near-white on
near-white is working software and a broken product, and until this existed
nothing here could tell the difference. What the first run found, on
2026-08-28:

- **104 contrast failures across 35 of 165 tool pages.** Mostly accent colours
  used both as text on a cream background and as a button fill under white
  text, sitting between 2.9:1 and 4.4:1.
- **Links invisible inside dark result panels, at 1.1:1.** Four calculators
  painted their own dark fill and set no link colour, so anchors fell back to
  the browser default blue on near-black. Those anchors are the cross-links to
  the worked-example pages — the SEO surface the site is written to be found by.
  115 ventures had the same panel and one had a link rule; all have one now.
- **Comparison tables overflowing their sticky panel.** The columns that spilled
  were painted outside the panel's dark fill, in the panel's near-white ink, on
  the light page background: 1.05:1, on five search-landing pages. The spilled
  column carried the answer the page exists to give.
- **Six unit dropdowns with no accessible name.**

Two viewports because two of those existed at exactly one width. The overflowing
table is a *desktop* bug — the sticky panel is narrow on a wide screen and the
venture's own media query already handles the phone — so the 390px sweep
`sweep.mjs` rightly uses would have found none of it.

Not in CI: axe-core and Playwright are not dependencies of this repo, the same
reason `journey.mjs` and `sweep.mjs` are not. The parts that can be asserted
without a browser are in `build.test.mjs` instead, and they check for the
*anti-patterns* rather than the ratios — an `opacity` on inherited text, a
result panel with no link rule, a `tabindex` added without measuring. Opacity is
the one worth naming: it is invisible to review, it multiplies a colour the
chrome never chose, and there is no value of it that is safe on a host already
at the AA floor.

#### The browser-free half of that check

`contrast.mjs` not being in CI is what let the same defect class come back. A
browser run on **2026-08-30**, two days after the sweep above, found 20 fresh
serious 1.4.3 violations on four pages that had been live in `main` since. All
20 were on links, and three of the four are the accent-as-text shape the earlier
run had already fixed 104 instances of.

`ink.mjs` closes that gap for the part of it that needs no browser:

```bash
node platform/pages/ink.mjs            # report
node platform/pages/ink.mjs --strict   # non-zero exit on a violation
```

It reads each venture's inline `<style>` and decides **link text only** —
resolving `var()` against `:root`, honouring declaration order, judging
`.verdict a` against `.verdict`'s own fill, and compositing a container's
`opacity` the way the browser does. On the four pages above it reproduces all
five findings exactly, axe's blended `#bc754c` at 3.31:1 included, from the
stylesheet alone. `.github/workflows/link-contrast-ci.yml` runs it on every
change to `ventures/**/*.html`.

Links only, deliberately. Without a DOM there is no way to know which box a bare
class sits in: `.positive{color:#a9e8b5}` reads as a 1.16:1 failure against the
page and is in fact fine, because it only ever renders inside a dark `.result`
panel. A first cut decided those anyway and produced **510 findings against
axe-core's zero**. Links are the element whose colour is routinely set
independent of its container, which is why they carry every violation both runs
actually found.

Every run also prints what it *declined* — an unresolvable `var()`, a page with
no inline stylesheet — and the count of non-link colours it never looked at
(3273 of them). That is not decoration:
`portfolio/research/a11y-delivered-contrast/` exists because an engine handed no
stylesheet decided nothing, emitted no 1.4.3 finding, and was byte-identical in
its output to a page that had been checked and passed. A clean `ink.mjs` run is
a floor, not a ceiling; run `contrast.mjs` over a build before believing it is
the whole story.

### Checking a shared bid arrives as the bid that was sent

`roundtrip.mjs` asks the question the other three cannot: **does the link a tool
copies open as the bid it was copied from?**

```bash
node platform/pages/roundtrip.mjs   # same BASE_URL / PLAYWRIGHT / CHROME_PATH / DIST env vars
node platform/pages/roundtrip.mjs shopify-fee-calculator   # or just these tools
ONLY_SLUGS=shopify-fee-calculator node platform/pages/roundtrip.mjs   # same thing
```

For each tool: change every select and number input, type into the proposal's
three prose terms, copy the link the page's own button copies, open it in a
browser that has never seen the tool, and compare every control and the headline
figure. Exit status is non-zero on any difference.

The prose pass is named rather than "every textarea": a textarea on these pages
is as often an input the tool parses as it is wording — `cut-list-optimizer`
takes a parts list in one — and typing a sentence into that would report a
dropped field that is really a refused edit. Its absence is why the first run
reported `depositPercent` and `validDays` on 48 tools and not the three
textareas beside them, and why the fix was scoped to two of five terms until
someone read the panel.

This failure is silent by construction. The link is a second serialization of the
form, and nothing on the page disagrees with it — the recipient sees a complete,
plausible, *different* answer. It had already cost this portfolio twice, both
found by hand after shipping: `where-to-sell-calculator` dropping `quantity` and
`targetMargin` from its own allowlist (2026-08-24), and `shopify-fee-calculator`
serializing sixteen of twenty-six fields and writing back two of five panels
(2026-08-29).

What the first run found, on 2026-08-29:

- **`security-camera-bid-calculator`'s link never opened at all.** Its proposal
  scope draft runs past `MAX_LINK_VALUE`, so the encoder set it aside — rightly.
  The decoder then found a control the link had not mentioned, read that as a
  link written by some other tool, and refused the whole bid. 33 of 43 fields
  stayed at their defaults and the headline read $7,440 against the sender's
  $2,768. An omission the encoder makes on purpose is now named in the payload,
  so the guard keeps its teeth for the case it was built for.
- **`amazon-fba-calculator` restored the sender's placement fees and then wrote
  the size-tier defaults over them**, because a restored value was not marked
  hand-entered. Its two preset selects did not travel either, so the recipient
  read "Home & kitchen (15%)" over a 17% referral rate.
- **48 tools dropped `depositPercent` and `validDays`** — the proposal deposit
  and how long the price is held. Their share specs carried the pricing form and
  not the terms. One cause, not 48, which is why the report groups repeated
  fields at the end.

  **Fixed for the 36 on the shared spec** (2026-08-29). That spec now has a
  `text` kind beside `numbers`, `flags` and `choices`, so the three prose terms
  (`paymentTerms`, `proposalNotes`, `proposalExclusions`) travel with the two
  numeric ones; `withProposalTerms` folds all five into a page's spec and
  `readProposalTerms` collects them off the panel. The cost of leaving it was
  measured in a browser before and after: on the pre-fix tree the recipient of a
  turf bid printed a customer proposal asking **$1,640.44** on acceptance where
  the sender's sheet said **$2,734.07**, held 30 days instead of 15, with the
  payment terms gone. Both sheets now match. A term past `MAX_TERM_TEXT` is
  dropped whole rather than truncated, and the *sender* is told which one stayed
  behind — the lesson from the camera calculator above, applied on the way out.

  **And fixed for the other 12** the same day. Those predate the shared spec and
  keep a hand-written allowlist each, in three different encodings between them
  — a JSON payload, a query string derived from `calc.mjs`, and a cost-id list.
  Rewriting all three onto the shared spec would mean touching the input
  handling of twelve working calculators to carry a field none of them compute
  with, so `platform/proposal/terms.mjs` (vendored as `proposal-terms.mjs`)
  carries the terms *beside* whatever the venture already writes, in one
  parameter its own decoder never sees:

  ```
  #<the venture's own payload>&pfterms=<the five terms, url-encoded>
  ```

  The value is URI-encoded whole, so an `&` or `=` inside a payment-terms clause
  is not a boundary, and `splitTerms` hands the venture its JSON payload back
  byte-for-byte — leaving the segment on the end would fail `JSON.parse` and
  refuse the whole bid rather than merely dropping a field.
  `painting-bid-calculator` is the one exception to where they ride: its own
  payload is a *query* string, and a fragment is not sent in the request line a
  server logs nor in a later click's `Referer`, so its terms take the fragment
  and its numbers stay where they were.

  Three guards, each checked to fail on real drift before being kept:
  `platform/proposal/term-ids.test.mjs` (adopt.mjs, the 36 share modules and the
  12 vendored ones all name the same five ids, and every adopting page wires
  them), and `sync.test.mjs` (no vendored copy drifts from the canonical one).

A preset select that comes back empty or as `other` is not a finding, and is no
longer reported as one: the recipient now holds custom rates, and "Choose a
starting job…" or `other` is the honest label for them. Carrying the preset id
instead would re-apply it on arrival and write the venture's kit figures over the
sender's own — the exact defect #1984 repaired on `amazon-fba-calculator`. The
teeth stay, because every field such a select would have written is compared like
any other: a preset that takes the rates with it still fails. Implemented rather
than left as prose because a probe reporting 39 known-benign failures is a probe
whose fortieth, real one goes unread — 88/128 became 124/128 with nothing hidden
that moves a number.

**The four that remained after that** were one shape, and are closed (#1987).
Each was a preset select on a form whose numbers no longer matched any preset —
exactly the state this probe creates by perturbing every input. Two answered
honestly (`other`, `none`) and two named a *different specific thing* (`22`,
index `0`) rather than admitting no preset applied:

| tool | field | what the recipient saw | how it was closed |
|---|---|---|---|
| `drywall` | `boardType`, `textureType` | the rates carried; the select re-derived and found no match, so the customer's proposal named neither the board nor the texture (`textureLabel`) | the ids now ride in the share allowlist |
| `attic-insulation` | `productType` | the same, cascading into the drafted scope: "blow **blown fiberglass** over 1,120 sq ft" became "blow insulation over 1,120 sq ft" | as above |
| `siding` | `materialType` | "Other / custom rates" over the sender's fiber cement | as above |
| `standby-generator` | `presetKw 10→22` | `generatorKw` carried; the select fell back to `GENERATOR_PRESETS[3]` — so typing 17 kW made it read "22 kW" with no link involved at all | a "Custom size" state, re-synced from the kW field both ways |

Carrying a preset id is only safe the way `applySharedChoice` does it: validated
against the options that page offers, and assigned **without** dispatching
`change`. Dispatching re-stamps the preset's own rates and would replace the
sender's typed price with the venture's ballpark — the defect #1984 repaired on
`amazon-fba-calculator`. That distinction is the whole reason the exemption above
and these four fixes can both be right: a picker whose label is *scaffolding*
should hand back its placeholder, and one whose label *names the work on a
customer's document* has to travel.

The run has been **128/128** since #1987 — the first clean pass across every
share link on the site.

Not in CI, for the same reason as `sweep.mjs` and `contrast.mjs`: Playwright is
not a dependency of this repo.

### Checking a picker does not eat the takeoff

`presets.mjs` asks what none of the other probes do: **when the contractor picks
the placeholder back, does the form survive?**

```bash
node platform/pages/presets.mjs   # same BASE_URL / PLAYWRIGHT / CHROME_PATH / DIST env vars
node platform/pages/presets.mjs metal-roof-bid-calculator   # or just these tools
```

For each select carrying an empty-valued option: choose a real option, type a
takeoff over the figures it stamps, then choose the placeholder — and require
that nothing but the select itself moves.

It found data loss on **40 of 65 pickers** on its first run (2026-08-29). One
expression, repeated across the family:

```js
const preset = JOB_PRESETS[Number(select.value)];
if (!preset) return;
```

`Number('')` is **0**, so "no job chosen" resolves to the *first preset in the
list* and the guard never fires. Measured in Chromium on
`metal-roof-bid-calculator`: a roofer chooses a starting job, replaces the
numbers with their own takeoff (77 × 41, **$39,125.74**), reopens the dropdown
and selects "Choose a starting job…" — and the takeoff is gone, replaced by the
worked example at **$11,097.21**. No warning, no undo, and the page looks exactly
as healthy afterwards. `foundation-repair` lost $24,365 → $9,489,
`spray-foam` $20,842 → $10,979, `mold-remediation` $9,093 → $1,724.

The tools that spell the guard `if (select.value === '') return;` were always
correct. The two spellings look alike and behave completely differently, which is
why this needed a browser rather than a reading: the difference is invisible at
the call site, and 63 pages carried the dangerous one at 102 call sites. It is
now written so the danger is legible where it lives:

```js
const job = presets.value === '' ? null : JOB_PRESETS[Number(presets.value)];
```

The read sites matter as much as the change handlers, and are why the fix covers
all 102 rather than the 40 the probe flags: `copySummary` uses the same lookup
for the bid's *title*, so with the placeholder selected it titled a contractor's
summary with a preset they had not chosen. That half is invisible to this probe,
which only drives the picker.

The probe finds pickers **structurally** — a select with an empty-valued option
whose real options rewrite the form — rather than by name, so a new tool with a
differently-named picker is covered on the day it lands. `standby-generator`'s
`presetKw` was caught by exactly that, without ever being named.

Not in CI, for the same reason as the three above.

### Checking the page points at the input it rejected

`highlight.mjs` asks the question behind ["Pointing at the input that was
rejected"](#pointing-at-the-input-that-was-rejected): **when the calculator
refuses a number, is the box it is refusing actually marked?**

```bash
node platform/pages/highlight.mjs   # same BASE_URL / PLAYWRIGHT / CHROME_PATH / DIST env vars
node platform/pages/highlight.mjs fence-bid-calculator   # or just these tools
```

For every tool that prints "check the highlighted input" it breaks one of the
venture's own numeric fields — preferring one the markup itself constrains, so
-5 is out of range by the page's own declaration — and reads back what got
marked. Three outcomes, and they are different failures:

| | |
|---|---|
| `ok` | the field that was broken is the field that got marked, **or** the message named no field and the label stopped promising a highlight |
| `WRONG` | something was marked, but not the field that was broken |
| `FAIL` | the page still promises a highlight and marked nothing |

Run against `main` before `invalid.mjs`, every one of the 103 came back `FAIL`.
It is **103/103 `ok`** now, with zero `WRONG` — every tool marks the exact field
the probe broke.

It selects tools by the promise in the built artifact, not by a list, so a
calculator that lands tomorrow carrying that line is checked the day it ships —
and one that does not print it is left alone rather than reported for a promise
it never made.

Not in CI, for the same reason as the four above.

### Checking no page scrolls sideways on a phone

`sideways.mjs` asks the question the other five pass straight through: **is the
page wider than the window it is being read in?**

```bash
node platform/pages/sideways.mjs             # same BASE_URL / PLAYWRIGHT / DIST env vars
WIDTH=320 node platform/pages/sideways.mjs   # the width WCAG 1.4.10 names
```

A page wider than the viewport is not a broken tool — every one of the 39 this
found on 2026-08-29 computed correctly, and `sweep.mjs` said so. It is a browser
zooming out until the page fits, so every figure on it renders at roughly half
size and the right-hand columns sit off-screen behind a scrollbar most phone
visitors never think to use. Axe has no rule for it, so `contrast.mjs` passed
them too.

Measured on a build of `main` before `reflow.mjs`, and after:

| viewport | before | after |
|---|---|---|
| 320px (WCAG 1.4.10) | 60 of 445 | **0** |
| 360px (a common Android) | 39 | **0** |
| 390px (what `sweep.mjs` drives) | 7 | **0** |

The default is 360 because that is the phone this audience carries. `WIDTH=320`
is the width the standard names and is also clean; run it before believing a
narrow-viewport change.

Not in CI, for the same reason as the five above.

## Reflow, and the two things that widen a page

`reflow.mjs` is the build half of what `sideways.mjs` measures. Its header
carries the full reasoning; the short version is that all 39 pages had one of
two causes.

**A wide `<table>` in normal flow**, 33 of them. A table cannot shrink below the
min-content width of its columns, so a five-column comparison of dollar figures
pushed the whole document out to ~600px and dragged every paragraph with it.
Each table in the markup is now wrapped, at build time, in a
`div.pf-table-scroll` that scrolls instead — and `SCROLL_A11Y_SCRIPT`, which
already existed for the ventures that hand-wrote their own `.table-wrap`, gives
that box a keyboard tab stop when it is really scrolling and takes it away when
it is not. The same script also creates the box for a table a calculator writes
into its result panel from a string, which no build pass can see;
`cut-list-optimizer`'s 4x8-vs-5x5 comparison is that case.

**A grid or flex track that will not shrink**, the other 6. A grid item's
automatic minimum is its min-content width, so one `<input>` at its
20-character default — or one table the wrap above just made scrollable — held a
whole column open. Relaxed with `min-width:0`, under a 640px media query, on
form controls, on the boxes that contain one or contain a scrolling table, and
on the page's own semantic layout containers.

**Every one of those selectors is wrapped in `:where()`**, so a rule a venture
wrote always wins. That is not decoration. The first version of this rule was
`:where(*){min-width:0}`, and measured against the same build it collapsed the
term column of every `<dl>` laid out as a grid: **372 result labels across 70
pages** painted over their own values, which is worse than the bug it fixed. A
definition list holds neither a control nor a table and no longer matches.

### The four that needed their own rule

Four pages survived both build-time rules at 320px, and each needed a fix in its
own venture rather than another site-wide one. They are worth reading as the
shapes a site-wide rule cannot reach:

- **`attic-insulation-bid-calculator`**, +35px. One `<dd>` read `2.16 h (36% of
  blow+seal+baffle+removal)`, and `blow+seal+baffle+removal` has no space or
  hyphen to wrap at, so that one token set the width of the whole value column.
  Fixed in the sentence — `blow + seal + baffle + removal` — which reads better
  on the sheet anyway.
- **`saas-seat-true-up`** (+34px) and **`music-lesson-break-even`** (+17px). A
  two-column `.results` grid leaves ~140px a column at 320px, and "seat
  utilization" under a `$432.00` needs more. Stacked below 380px.
- **`seller-net-sheet`**, +9px. `$119,057.50` at `2.8rem` is 290px of digits
  with no break opportunity in them. The headline is `clamp(1.9rem, 11vw,
  2.8rem)` now: as large as the card can hold, never larger.

A long unbreakable token and a fixed-column grid are both real layout decisions
a venture is entitled to make. Overriding either from the shared stylesheet
would be the blunt rule again, in a new place.

## Deploying

`.github/workflows/portfolio-pages.yml` builds and tests on every push to `main`
and every pull request that touches `ventures/` or this directory, so a broken
site is caught at merge time whether or not publishing is on.

Publishing is gated on an owner-set repository variable:

| Setting | Where | Value |
|---|---|---|
| Pages source | Settings → Pages | **GitHub Actions** |
| `PAGES_ENABLED` | Settings → Variables → Actions | `true` |
| `PAGES_BASE_URL` *(optional)* | Settings → Variables → Actions | a custom domain, with trailing slash |

That is the `deploy-settings` flip already in the owner decision queue. It is
not a second ask — this workflow is what it now publishes.

Not `GITHUB_PAGES_ENABLED`, which this table named until the rename below.
GitHub rejects any Actions configuration-variable name starting with
`GITHUB_` (case-insensitive) at creation time, so that spelling could never
actually have been set — the owner following this table as written would
have hit a validation error in Settings and no `deploy` job would ever have
run.

Until it is set, the `deploy` job is skipped and the `build` job still runs, so
the artifact is always proven buildable. `actions/deploy-pages` 404s while Pages
is off, which is why the gate exists rather than letting every merge go red.

The gate also requires `github.ref == 'refs/heads/main'`. `workflow_dispatch`
can be run against any branch, and publishing the live site from a feature
branch is not a mistake anyone would notice quickly.

After deploying, the workflow fetches the real public URL — the front page,
both sitemaps, `robots.txt`, `catalog.json`, `llms.txt`, and one product — and
fails if any of them does not return 200, if `sitemap.xml` comes back without a
sitemap index, or if `llms.txt` comes back with no tool entries. A completed deploy step is not evidence that anything serves; this makes
"deployed" a fact rather than an inference. The product it fetches is named by
the catalog it just downloaded rather than hardcoded: a hardcoded slug stops
proving anything the moment that venture is renamed, and reports the rename as
a dead site.

Only one workflow may publish to Pages. `retail-pilot-intel-deploy-docs.yml`
reads `RETAIL_PILOT_INTEL_PAGES` instead, so an owner who wants those docs on
the origin makes that choice explicitly rather than having two deployments race.

The same applied to `pages.yml`, a **second portfolio site** built independently
the same hour (`platform/ci/build_pages_site.py`), which deployed on the same
owner-set variable (spelled `GITHUB_PAGES_ENABLED` at the time) from a
different concurrency group — so the flip
would have armed two publishers of two different builds for the one origin. That
is resolved on `main`: `pages.yml` no longer deploys, it still builds and checks
its artifact as an independent second opinion on what `ventures/` contains, and
`publish_surface.py --check` now fails if one variable would ever arm two Pages
deployments again.

## Build speed

Measured 2026-10-24 (write-up: `docs/history/pages-build-speed-2026-10-24.md`).
A merge took about 7 minutes to reach the live site when the run passed, and
only 6 of the last 100 runs on `main` did: 64 failed, 60 of them on one blog
post's front matter, so the median merge took 48 minutes to go live and the
worst 169. What changed, and why it is not a new framework:

- **Bad posts no longer stop a deploy.** `PAGES_SKIP_BAD_POSTS=1` (set on
  deploys only) leaves a malformed post out with a `::warning::`; pull requests
  and the `test` job stay strict, so it is still flagged.
- **Share cards are cached** (`share.mjs`, `renderCards`, `PAGES_CARD_CACHE`).
  Drawing about 2,700 PNGs in JS was half the build. A card is keyed by its
  options and a hash of the renderer and fonts, so a cached copy is exactly
  what a fresh draw would produce (cold and warm builds are byte-identical).
  The workflow keeps one entry per renderer version per day in `actions/cache`.
- **Audio is served from jsDelivr** (`audio-cdn.mjs`, `--audio-cdn`). The MP3s
  stay in git; the build links each to
  `cdn.jsdelivr.net/gh/<repo>@<last commit that changed it>/<path>` and drops
  it from the artifact (424 MB of 776). jsDelivr returns `audio/mpeg`, byte
  ranges and open CORS. A file that is not committed, edited locally, over
  jsDelivr's 20 MB limit, or that nothing links stays on Pages.
- **Independent passes run concurrently** (`mapLimit`): the chrome pass, share
  tags and the offline layer each did one page at a time.
- **The dashboard runs under the build.** Its GitHub API calls (103 s) start
  in the background before the build and are waited for afterwards. A
  blob-less checkout was measured and rejected: the daily brief's `--numstat`
  makes git fetch its window's blobs commit by commit, which is slower than
  the full clone (history doc, "The blob-less clone").

Local build, same machine: 110 s before, 96 s with no card cache, 50 s with one.
The language was never the problem: about 7 s of the old build was JavaScript
doing work; the rest was drawing images, waiting on the disk one file at a
time, and moving bytes that had not changed.

## Rollback

The site is rebuilt from `main` on every push and holds no state — no database,
no user data, nothing to migrate. To roll back, revert the offending commit and
let the workflow republish, or re-run an earlier successful run of
`Portfolio Pages` from the Actions tab. To take the site down entirely, set
`PAGES_ENABLED` to anything other than `true`.

**Rolling back the service worker needs its own lever.** A worker lives on the
visitor's device and keeps answering there, so reverting the commit does not
take it back — and taking the site down leaves each visitor on their last cached
copy. Build with `PAGES_DISABLE_SW=1` and deploy: the published `sw.js` is then
one whose only job is to delete every cache, unregister itself, and reload the
page. Each visitor is cleaned up on their next visit.

```
PAGES_DISABLE_SW=1 node platform/pages/build.mjs --out=dist
```

## Privacy and terms

Every published tool runs entirely in the visitor's browser; nothing they type
is uploaded, because there is no server that could receive it. The hub counts
anonymous aggregate events (a visit, which tool slugs were opened) in the
visitor's own `localStorage`, with an in-page opt-out, and counts nothing at all
when the browser sends Do Not Track or Global Privacy Control.

The injected chrome counts on the same terms and under the same key and opt-out:
`tool_viewed:<slug>` when a page loads and `cross_tool_click:<slug>` when a
visitor follows the nav. Until then the hub was the only page that counted
anything, so a visitor arriving from search straight at a deep SEO page — the
traffic those pages exist for — was invisible. Nothing is transmitted: there is
no `fetch`, no beacon, and the counts never leave the device.

Those counts are also what the hub gives back. **Pick up where you left off** is
a row above the catalogue listing the tools this browser has actually opened,
most used first, read from the same `tool_viewed:<slug>` counts. Thirty-seven
tools is a lot to search through when someone came back for the one they used
last week, and this is the whole return path — no account, no sign-in, no server
that could know who they are. It is worth stating plainly that the counting is
what makes the shortcut possible; the value goes to the person the data is
about, and it never leaves their machine.

It holds to the same rules as the counting it reads:

- Opting out, or a browser sending DNT/GPC, means no counts exist, so the row is
  not shown at all — the hub looks exactly as it does to a first-time visitor.
  Ticking the opt-out removes the row in the same click rather than on the next
  visit.
- No history, no storage, or script off: the section ships `hidden` with an empty
  list, so nothing appears and the full catalogue below is the fallback.
- Every tool shares one origin, so any page on the site can write to that key.
  A stored slug is used only if it matches `^[a-z0-9][a-z0-9-]*$` **and** the
  hub is currently showing that tool; the link is built from the validated slug,
  and titles are written with `textContent`, never as markup.

The offline cache is the visitor's own browser storage: pages and scripts this
site served them, held on their device, cleared by clearing site data. No
personal data is stored, and nothing cached is ever sent anywhere.

The hub carries the no-warranty and no-SLA copy from `PRODUCT_PLAYBOOK.md` §5b,
required on every hosted surface, plus an optional GitHub Sponsors link that
gates nothing.
