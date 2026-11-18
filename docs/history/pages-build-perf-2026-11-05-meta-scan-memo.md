# Pages build: scan a page's meta tags once (2026-11-05)

**Reading.** Warm build (`PAGES_CARD_CACHE` set, `node --cpu-prof`, 4-core
sandbox): 64.3 s wall. `metaContent` in `platform/pages/share.mjs` had 2.18 s
self time plus 1.47 s in its tag-matching regex. It runs about fifteen times
per page and each call rescanned the whole HTML and compiled a new RegExp for
every meta tag.

**Change.** A one-slot memo keeps the meta tags of the last HTML string seen,
and each attribute/key matcher is compiled once. Same first-match-in-document
order, same decode.

**Verification.** `node --test platform/pages/share.test.mjs`: 30 pass. Full
warm build before and after: `diff -rq` shows only `version.json` (its
`built_at` stamp) differs. Profile after: `metaContent` 1.16 s, the meta regex
no longer in the top 18; build wall 64.4 s to 63.6 s (inside run noise, the
saving is about 1.5 s of CPU).

**Not changed, ranked.**
1. `linkSiblings` (`writing.mjs:489`) 2.4 s self.
2. `esc` (`devlog/markdown.mjs:11`) 1.8 s, one regex per call.
3. `spawnSync` 4.2 s: child processes (idle is 13 s, so mostly waiting).
