# Portfolio Pages

The public site. `build.mjs` assembles every static, browser-runnable venture
surface in this repository into one GitHub Pages deployment, behind a hub page
that lists and searches them.

```
node platform/pages/build.mjs --out=dist          # build
node platform/pages/check.mjs dist                # check the artifact
cd platform/pages && node --test "*.test.mjs"   # what CI runs
```

Then serve it and click around:

```
cd platform/pages/dist && python3 -m http.server 8899
```

## Why this exists

GitHub serves **one** Pages site per repository. Before this, the only workflow
that could publish one built `retail-pilot-intel`'s passcode-gated docs app — so
the owner's single `GITHUB_PAGES_ENABLED` flip would have put an internal docs
site live and left every finished calculator with no public URL at all.

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

Categories are also what `relatedTools` and the machine surfaces read, so a
mis-filed tool is not only badly placed on the hub — it is offered to the wrong
visitor at the foot of every sibling page, and described to assistants under the
wrong heading in `llms.txt`. Five tools were filed in "More free tools" until
2026-08-27 for want of a keyword, `tiktok-shop-fee-calculator` among them: a
marketplace tool a seller would only have found by searching for it by name.

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

`rates.mjs` and the chrome still inline theirs (701 KiB and 310 KiB across the
site). The same extraction applies to both and has not been done.

Every field on the page is saved together under a name the visitor types, and
restoring puts the whole job back. Because a bid never crosses tools, no field
needs its meaning reviewed the way a shared rate does — which is why this
reaches 234 pages against the rates bar's 103. Excluded: `usageOptOut`, which
is a fact about the browser rather than the job, and anything the chrome itself
injects.

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
   and modules up front (~3 MB), for someone who knows they are about to lose
   signal. It is a button, never automatic: nobody's mobile data gets spent
   without them asking.

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

Reading sources is what makes it cheap enough to run from a venture's own CI,
which is where it now runs. That matters because the built-site assertion in
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
BASE_URL=https://duncan-haywood.github.io/monorepo-projects node platform/pages/journey.mjs
```

It covers the hub and its grouping, search (narrowing, the empty state, and
clearing), the usage opt-out across a reload, a click through into a calculator
and a computed figure, a cross-product sibling link, a nested product hub, every
URL in every sitemap, the 404, a 375px viewport for horizontal overflow, and two
whole-run assertions: that nothing was fetched off-origin, and that no page,
console, or resource error was raised anywhere except the deliberate 404 step.

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

## Deploying

`.github/workflows/portfolio-pages.yml` builds and tests on every push to `main`
and every pull request that touches `ventures/` or this directory, so a broken
site is caught at merge time whether or not publishing is on.

Publishing is gated on an owner-set repository variable:

| Setting | Where | Value |
|---|---|---|
| Pages source | Settings → Pages | **GitHub Actions** |
| `GITHUB_PAGES_ENABLED` | Settings → Variables → Actions | `true` |
| `PAGES_BASE_URL` *(optional)* | Settings → Variables → Actions | a custom domain, with trailing slash |

That is the `deploy-settings` flip already in the owner decision queue. It is
not a second ask — this workflow is what it now publishes.

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
`GITHUB_PAGES_ENABLED` flip from a different concurrency group — so the flip
would have armed two publishers of two different builds for the one origin. That
is resolved on `main`: `pages.yml` no longer deploys, it still builds and checks
its artifact as an independent second opinion on what `ventures/` contains, and
`publish_surface.py --check` now fails if one variable would ever arm two Pages
deployments again.

## Rollback

The site is rebuilt from `main` on every push and holds no state — no database,
no user data, nothing to migrate. To roll back, revert the offending commit and
let the workflow republish, or re-run an earlier successful run of
`Portfolio Pages` from the Actions tab. To take the site down entirely, set
`GITHUB_PAGES_ENABLED` to anything other than `true`.

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
