# Blog finder: posts.json 4.7 MB to 2.5 MB raw, 1.06 MB to 0.83 MB gzip (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). The two open perf
backlog items (P063, P064) only touch owner-only workflow files. The previous
pass (`pages-build-perf-2026-11-25-writing-search-index.md`) ranked
`writing/posts.json` first in its "not changed" list. The blog fetches that
file on any filter, sort or search, including the "For your business" topic
chip that leads to the paid product lines' customer posts.

## Reading

Each of the 7,364 rows was `[slug, title, description, date, minutes, topic,
topic label, tags, card text]`. Two of those columns are pure functions of the
others:

- **topic label**: `topicLabel(topic)`, one of about a dozen strings, repeated
  in every row;
- **card text**: `[title, description, tags, label].join(' ').toLowerCase()`
  with runs of whitespace collapsed. This repeats most of the row a second time.

## Change

`platform/pages/writing.mjs`:

- `cardTextOf(title, description, tags, label)` is now the one definition of
  card text. It is a function declaration so it hoists above `FINDER_SCRIPT`.
  The build's `cardText(p)` calls it, and the finder script embeds
  `cardTextOf.toString()`, the same pattern `bodyMatcher` uses. The browser
  therefore runs exactly the code the build and the tests run.
- The finder embeds the topic id to label table (`TOPICS`) and falls back to the
  id, as `topicLabel` does.
- `renderPostRows` writes seven columns: `[slug, title, description, date,
  minutes, topic, tags]`.
- The finder still reads a nine-column row (`r.length > 7`), so a new page
  served an old cached file during a deploy still works. The opposite case,
  an old page given the new file, would show `undefined` card text until the
  next navigation. The service worker's per-build cache makes that unlikely
  (`addOfflineSupport`: "a visitor is never served a mix of two builds").

## Verification

- `node --test platform/pages/writing.test.mjs`: 62/62. Two new tests run the
  page's inline finder script against a fake DOM:
  - Seven-column rows with doubled spaces, a tab, a newline, `É`, empty tags
    and an unknown topic rebuild the card text with the pre-change formula, and
    the same tags and label.
  - A nine-column row from an older file still renders its card.
- The other Pages tests that import the writing module (`heading-order`,
  `podcast`, `post-table-phone`, `raw-markdown`, `site-nav`, `check`):
  145/145.
- Real corpus: both full builds compared row by row, with the rebuilt label
  and card text checked against the old columns. All 7,364 rows matched, with
  0 mismatches.
- Full site diff (`diff -rq`): only `writing/index.html`,
  `writing/agents/index.html` (the finder script), `writing/posts.json` and
  the usual stamps changed (`changelog`, `engineering`, `updates`,
  `version.json`, `sw.js`).
- Chromium, both builds served gzip, service workers blocked. The queries
  `retainage`, `quickbooks retainage`, `for your business`, `zzqx` and `lien`
  gave the same counts on both builds (29, 4, 795, 0 and 159 of 7,364) and the
  same topic labels on the first cards.

## Numbers

| metric | before | after | how |
|---|---:|---:|---|
| `writing/posts.json` raw | 4,738,108 B | 2,491,904 B | `ls -l` on each full build |
| gzip (what the browser fetched) | 1,061,078 B | 828,147 B | Chromium `responseBodySize`, server gzips |
| brotli (what Cloudflare serves) | 783,727 B | 637,179 B | `zlib.brotliCompressSync` |
| `JSON.parse` | 15.2 ms | 7.8 ms | Node, one run each |
| transfer at 1.6 Mbit/s | about 5.3 s | about 4.1 s | gzip bytes ÷ link rate, computed, not timed |
| `writing/index.html` | 225,982 B | 225,096 B | `ls -l`; the label table is smaller than the old inline code |
| site build | 2 min 57 s | 2 min 34 s | `time`, one run each, within noise |

The gzip saving (22%) is smaller than the raw one (47%) because the dropped
text was a near copy of the row, which gzip had already partly folded away.
Memory and parse time still fall by about half.

## Not changed, ranked for the next run

1. **The description column** is now the biggest one left: 1.10 MB of the
   2.49 MB raw. Every card the finder renders shows its description, so it
   cannot simply be deferred. It could be deferred if the finder rendered only
   the cards on screen (for example the first 50 matches with a "show more"
   button) and fetched descriptions in per-page chunks. That changes how the
   page behaves, not just its bytes, so it is a design change, not a perf
   patch.
2. **Server-rendered cards' `data-text`** repeats each card's own text in the
   HTML: 17 KB raw across the 56 cards on the first page. The finder could
   rebuild it with `cardTextOf`, but `descriptionHtml` differs from
   `description` for some posts. Check that before cutting it. It is small.
3. Unchanged from the last pass: `search.json` (2.45 MB gzip) is still the
   biggest thing a searcher waits on.
