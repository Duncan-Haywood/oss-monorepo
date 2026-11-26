# Pages build: the blog's CSS written once, not into 7,815 pages (2026-11-26)

Perf track (`prompts/perf/prompt-0.md`). Not a speed-up in build seconds: a
bytes cut in every full build's artifact and in every blog page a visitor
loads after their first.

## Reading

Pool (`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-26
19:08Z to 19:56Z): 691 jobs, 988.1 job-minutes, checkout 343.3. CodeQL 402.6
min, Security gate 164.9, Portfolio Pages 133.8 (heaviest step "Test the
site builder", 37.9 min). The checkout-heavy guards (CI policy 89%, Conflict
markers 81%, Security gate 59%) are all `priv-*`, owner-gated. No
agent-workable `perf:` backlog item (P063, P064, P086 are owner rows).

Checked and left alone this run, with numbers, so the next run need not:

- `ai-bookkeeper` suite (bet #5's neighbour, 4 earlier passes): 351 files,
  83.5 s summed, slowest file 2.6 s (`suite_file_times.py ai-bookkeeper`). Flat.
- `machine-shop-guides` RFQ reader (front door for bets #2 and #4):
  `readRfq` on the test fixture repeated to 132.8 KB takes 9.7 ms. Nothing to win.
- `prompts/` unit tests (15.6 s, `test_promptctl` 7.5 s and `test_redteam`
  6.1 s): the test files are `prompts/*.py`, owned in `.github/CODEOWNERS`.
- `platform/ci/test_run_workflow_locally.py` (274 tests, 8.4 s): a long tail,
  the top six are 0.5 s budget timeouts by design.

In the site-builder suite (`node --test "*.test.mjs" "cloudflare/*.test.mjs"`
in `platform/pages`, cold card cache, 286 s wall), the two slowest tests are
the shared full build (219 s cold) and `custom-domain.test.mjs`'s
two-venture fixture build (66 s in the suite, 36 s alone). The fixture build
alone (one venture, `disableWorker: true, cards: false`) writes **19,131
files, 371.6 MB**, of which `writing/` is 7,873 files and 334 MB.

What is in the 7,413 post pages (189 MB of HTML), summed per element:

| element | MB |
|---|---:|
| inline `<style>` | **96.0** |
| `<article>` | 22.9 |
| `<script>` (incl. JSON-LD) | 14.5 |
| `<nav>` | 11.6 |
| `<header>` | 7.7 |
| `<footer>` | 5.0 |

The `<style>` block is one constant (`STYLE` in `writing.mjs`, 12,934 bytes,
no `url()`, no per-page values), hashed identical on 7,815 pages: every post,
tag, topic, project and index page in `/writing/` and the agent blog. A post
such as `/writing/1099-pages-form-first/` is 24.6 KB, of which 12.9 KB is
that block.

## Change

`writing.mjs`: `STYLE` goes to one file at the site root,
`pf-writing.css` (`WRITING_STYLE_FILE`, `renderWritingStyle()`), written by
`buildWriting`. `shell()` links it with
`<link rel="stylesheet" href="${toRoot}pf-writing.css">` exactly where the
`<style>` element sat, so it still comes before `pf-site.css` (which
`withSiteHeader` inserts just before `</head>`) and the cascade order is
unchanged. Same pattern as `pf-chrome.css` and `pf-site.css`.

Tests:

- `post-table-phone.test.mjs` read the phone-table rule from the post's
  HTML; it now follows the post's own `<link>` to the stylesheet and checks
  the same order (base cell padding, then the phone rule) there.
- New `writing-style.test.mjs`: the file is written once at the root with
  `renderWritingStyle()`'s bytes (starts with the `:root` tokens, carries
  `PHONE_TABLE_CSS`); every blog page inlines no `<style>`, links
  `pf-writing.css` before `pf-site.css`, and the link resolves from the
  page's own depth (post, index, tag pages).
- `check.mjs` already reads every stylesheet a page links from the artifact
  (`check.mjs` line ~594), so its CSS checks still see these rules.

## Verification

All on this 4-core container.

| | before | after | how |
|---|---:|---:|---|
| full build artifact (`node build.mjs --out=… --audio-cdn`) | 1,248.3 MB | 1,147.5 MB (−100.8, −8.1%) | `du -sb` |
| same, as `tar czf` | 831.1 MB | 801.7 MB (−29.4, −3.5%) | `tar czf - … \| wc -c` |
| files in it | 39,094 | 39,095 (+1, the stylesheet) | `find -type f \| wc -l` |
| pages linking `pf-writing.css` | 0 | 7,815 | grep over the artifact |
| fixture build output (1 venture) | 371.6 MB | 270.8 MB (−27%) | scratch script calling `buildSite`, `du -sb` |
| full build wall, warm cards | 67.3 s | 65.8 s | bash `time`, one run each: **no change, within noise** |
| fixture build wall | 23.8 / 25.0 / 25.9 s | 23.6 / 25.0 / 25.8 s | in-script timer: **no change** |
| a post page | 24.6 KB | 11.6 KB | `wc -c` |
| the stylesheet on the wire, once | 0 | 3.5 KB gzip / 3.0 KB brotli | `zlib` level 9 / default brotli |

`node check.mjs <artifact>` exits 0 on the after build. The whole
site-builder suite passes (numbers in the run record's notes).

So: build CPU and wall time did not move. The full-build profile was already
flat (`writeFileUtf8` 5.5 s self over 19k files is per-file cost, not
per-byte), and the next run should not expect seconds from cutting bytes. What
moved is what is stored and shipped: 100.8 MB less written by every full
build (three per site-builder test run, one per deploy), 29 MB less
compressed in each uploaded Pages artifact, and for a visitor reading a
second post, about 3 KB less on the wire per page (the stylesheet is cached).
The cost is one extra stylesheet request on a visitor's first blog page; it
is same-origin, fetched in parallel with `pf-site.css`, which already blocks
render.

## Not changed, ranked for the next run

1. **The post page's remaining chrome**: `<nav>` 11.6 MB and `<header>` 7.7 MB
   across posts are the site header and breadcrumb, mostly identical
   markup; they are HTML, so they stay inline, but a tighter template would
   cut them. JSON-LD (11.6 MB) is per page by design.
2. **`/writing/search.json` (6.2 MB) and `/search-index.json` (5.3 MB)**:
   the two largest non-audio files. Who fetches them, and when, decides
   whether splitting is worth it; not measured here.
3. **Two more identical inline blocks**: hashing every `<style>` in the
   fixture artifact found two other blocks each repeated on 1,081 pages (and
   two on 31). Not traced to their builder in this run; if they are as large
   and constant as `STYLE`, the same fix applies, one PR each.
4. **Build seconds**: still the flat profile in
   `pages-test-perf-2026-11-25-test-card-cache-never-saved.md` item 3.
