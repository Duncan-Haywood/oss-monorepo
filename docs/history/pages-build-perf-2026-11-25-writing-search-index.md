# Blog search: the first keystroke fetched 6.7 MB; now 2.5 MB (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch owner-only workflow files, so this run took a
visitor-facing item.

## Sweep

Built the site (`node platform/pages/build.mjs --out=<dir>`, 2 min 35 s) and
loaded pages in Chromium with every request counted (gzip on, as Cloudflare
serves it):

| page | requests | transferred |
|---|---:|---:|
| `industries/construction/` | 2 | 18.6 kB |
| `pay-application-generator/` | 9 | 55.3 kB |
| `retainage-cashflow-calculator/` | 8 | 45.6 kB |
| `pay-app-guides/`, `lien-waiver-checker/`, `mechanics-lien-deadline-calculator/` | 7–8 | 37–41 kB |
| home page | 2 | 61.1 kB |
| `writing/` (the blog index) | 2 | 55.0 kB |

The front doors of bet #1 (pay-app billing) are already light. The outlier was
under the blog's search box: `writing/search.json` was **18.3 MB raw, 6.7 MB
gzip**, every post's full body (7,749 posts in the build), fetched on the first
keystroke. On top of that, every keystroke rebuilt `card text + ' ' + body` for
every card, about 18 MB of string concatenation each time.

## Change

`platform/pages/writing.mjs`:

- `renderSearchIndex` writes an inverted index:
  `{ slugs, words, posts }`. `words` is each distinct word once, and `posts[i]`
  lists the posts holding word i as base-36 gaps.
- `bodyMatcher(index)` reads it and returns `has(term)`, a memoised Set of
  slugs. The page's inline finder script embeds that same function
  (`bodyMatcher.toString()`), so the tests exercise the code the browser runs.
  It also reads the old slug-to-text shape, for a cache that still serves the
  old file during a deploy.
- The match is now `cardText.indexOf(t) >= 0 || has(t).has(slug)`.

**Why the answers cannot change.** The finder splits the query on whitespace,
so a term never contains a space. The body text is single-space-separated
words, so a term is a substring of the body exactly when it is a substring of
one of its words. The old `hay` joined card text and body with a space, so a
match never crossed the two either.

## Verification

- `node --test platform/pages/writing.test.mjs`: 60/60. Two new tests. One runs
  the page's inline script against a fake DOM with the new file and the old
  shape. The other is a seeded property test: across 61 generated posts and 18
  terms (punctuation, `-`, `'s`, `é`, link and code markup), `has(t)` equals
  the posts whose `searchText(body)` contains `t`.
- On the real corpus (the 18.3 MB file from the before build), 21 terms
  (`r`, `re`, `ret`, `retainage`, `g702`, `-`, `é`, `0`, `the` and more): 0
  mismatches against a substring search of the full bodies.
- Full site build after the change: only `writing/index.html`,
  `writing/search.json` and the agents section's pair changed, apart from the
  usual commit and time stamps (`changelog`, `version.json`, `sw.js`, `queue`,
  `updates`, `engineering`).
- Real browser, both builds, throttled to 150 ms RTT and 1.6 Mbit/s: typing
  `retainage`, `quickbooks retainage` and `zzqx` gave the same counts (26, 4
  and 0 of 7,348 posts) on both.

## Numbers

| metric | before | after | how |
|---|---:|---:|---|
| `writing/search.json` raw | 18,320,419 B | 6,076,025 B | `ls -l` on each build |
| gzip (what the browser fetched) | 6,703,979 B | 2,454,970 B | Chromium `responseBodySize`, server gzips |
| brotli | 4.99 MB | 2.11 MB | `zlib.brotliCompressSync` |
| `JSON.parse` | 121 ms | 17 ms | Node, one run |
| first keystroke to results, throttled | 39.6 s | 18.2 s | Playwright, the three queries above, same for each |
| site build | 2 min 35 s | 2 min 20 s | `time`, one run each, within noise; the index costs about 1.2 s |

Cost: the agents section's `search.json` grew from 9.9 kB to 10.5 kB. With 13
posts, the index's per-word lists outweigh the space saved on repeated words.

## Not changed, ranked for the next run

1. **`writing/posts.json`, 4.7 MB raw (1.05 MB gzip)**, fetched on any filter,
   sort or search. It is most of the 18 s that remain on the throttled link.
   Paging or a slimmer row (drop the description, and the `cardText` column
   that repeats title, tags and topic) would help.
2. **Drop tokens that are substrings of another token** in the index: a further
   18% raw, but the build pass took 3.2 s in a test and would need a
   cross-post rethink. Not worth it yet.
3. **Precompressed brotli.** Cloudflare already negotiates brotli for JSON,
   which brings the file to about 2.1 MB. Nothing to do in the repo.
4. **Share cards: 7,749 `share-card.png`, 365 MB** of the 1.9 GB site.
   Visitors never fetch them (only link unfurlers do), but they slow the
   deploy upload. Cached by name (`pages-test-perf-2026-11-16-shared-card-cache.md`).
