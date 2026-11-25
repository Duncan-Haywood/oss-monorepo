# Hub page: inline script comments, 2026-11-25 (perf track)

Lever 4 of the perf prompt ("what visitors wait on"). The site asset cache
run earlier today (`site-asset-cache-perf-2026-11-25.md`) ranked the hub's
75.7 KB inline module second among things left to do. Its proposed fix (load
the saved-bids code only for visitors who have saved bids) is a 12-hour job
touching about 15 tests. A first reading turned up a cheaper lever that ships
the same code.

## Reading before the change

`node platform/pages/build.mjs --out=<dir>` at `c08192fff` (2 min 57 s), then
a Node script over `<dir>/index.html`, with brotli at quality 11 and gzip at
level 9:

- `index.html`: 211,935 B raw, **43,604 B brotli**, 52,423 B gzip.
- Inline script: 86,838 B across three blocks (the module is 75,731 B).
  **23,218 B of that is lines whose first non-space characters are `//`.**
  Stripping only those lines would bring brotli to 36,419 B.
- The shared modules (`pf-jobs.js`, `pf-site.js` and others) and the bet #1
  front doors are already stripped (`stripForInjection`, `jobs.mjs`), or
  carry only about 200 B of comment lines: `/pay-app-guides/` 7,133 B → 7,060 B,
  `/pay-application-generator/` 10,635 B → 10,569 B. Not worth a change.
- Duplicated helpers: `BID_RECORD_HELPERS` (2,637 B) appears twice in the hub
  module, once directly and once inside `BACKUP_MERGE_HELPERS`. Brotli's
  window absorbs the second copy, so removing it would save almost nothing on
  the wire. Not changed.

## Change

`stripInlineScriptComments(html)` in `platform/pages/build.mjs` wraps
`renderHub`'s output. In each `<script>` and `<script type="module">` block it
drops the lines that start with `//` (after indentation). Nothing else
changes: indentation, blank lines and code lines stay byte for byte, and
JSON-LD blocks are not touched. In code, a line that starts with `//` can
only be a comment. It is not a regex, because a regex cannot begin with
`//`, and it is not a quoted string, because one cannot span lines without
a backslash. The only places such a line could be content are a multi-line
template literal or a continued string, so a script containing a backtick or
a backslash-newline is left whole. A `//` line that contains `*/` is kept in
case it closes a block comment. The hub's scripts contain neither, so all of
their comment lines go.

`stripForInjection` (which also trims indentation) was not reused. Trimming
is safe for function bodies, but not for a whole script that might hold a
multi-line string.

## Verification

- **Same tokens:** acorn (local only, `/opt/node-tools`) tokenised each hub
  script before and after the change. The token streams match (39 + 12,508 +
  2,161 tokens), and each stripped script parses. The HTML outside the
  scripts is identical.
- **Rest of the site:** `diff -rq` between the two full builds lists only
  `index.html`, `sw.js` (its cache name hashes the site, so it changes) and
  `version.json` (build time).
- `platform/pages/inline-comments.test.mjs`: three tests (comment lines go
  and code stays; template literal and continued string left whole; `*/`
  line and JSON-LD untouched).
- The full Pages suite (`node --test "*.test.mjs" "cloudflare/*.test.mjs"` in
  `platform/pages`, as CI runs it): the result is in the run record.

## After

`index.html`: 188,873 B raw (−23,062), **36,478 B brotli (−7,126, −16.3%)**,
43,182 B gzip (−9,241, −17.6%). The browser also has 20.7 KB less to parse in
the module and 2.3 KB less in the classic script. Cloudflare's on-the-fly
brotli runs at a lower quality than 11, so the live saving in bytes should be
close to the gzip figure.

## Not changed, ranked for the next run

1. **Load the saved-bids and backup code (about 39 KB raw after this change) only
   when `portfolio-saved-bids` exists.** It is still the largest part of the
   hub module that most visitors never run. Same test-coupling cost as
   before.
2. **The same stripping on other pages' inline scripts**: `/writing/` has 754 B
   of comment lines (37,600 → 37,276 B brotli), and most pages have about 200 B.
   That is under 1% each, so it was left out. The function is exported and
   works on any page.
3. `site-perf-hashed-modules` (from this morning's run): still the lever for
   revisits outside the service worker.
