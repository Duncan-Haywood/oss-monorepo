# Pages build: each page's meta tags scanned once, not once per question (2026-11-28)

Perf track (`prompts/perf/prompt-0.md`). A small, exact cut in the site
builder's main thread: about 0.8 s of CPU per full build, which every
Portfolio Pages job and every local `platform/pages` test run pays several
times. It is below the noise of a wall-clock pair in this sandbox, and this
note says so.

## Reading

Pool (`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-28
00:03Z to 00:38Z): 655 jobs, 844.1 job-minutes, checkout 282.9. CodeQL 227.4
min, Portfolio Pages 168.1 (heaviest step "Test the site builder", 56.2 min),
Security gate 131.3, ventures tests 71.4. The checkout-heavy guards (CI policy
88%, Conflict markers 81%, Security gate 59%) are all `priv-*` workflows,
owner-gated as on 2026-11-25 and 26. No agent-workable `perf:` backlog item
(P063, P064, P086 are owner rows).

Site-builder suite (`node --test "*.test.mjs" "cloudflare/*.test.mjs"` in
`platform/pages`, no card cache): 2,230 tests, all pass, **321 s wall** (14m55s
user). The first test that awaits the shared full build reports 265.8 s; the
custom-domain fixture build 49.7 s; nothing else over 10 s. So the suite is
still the full build.

Full build, `node --cpu-prof build.mjs --out=<dir>`:

- cold card cache: 137.1 s, of which 78.4 s idle (the card worker pool, as
  `pages-build-perf-2026-11-12-warm-phases.md` found; CI keeps the cache warm);
- warm (`PAGES_CARD_CACHE` set, second build): **53.1 s**, 3.3 s idle.
  Largest self times: `writeFileUtf8` 6.65 s, GC 4.62 s, `readFileUtf8`
  1.82 s, open/read/close/fstat about 5.5 s together, then one regex,
  `<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>`, at 1.12 s.

That regex's callers (self time, grouped by stack):

| caller | s |
|---|---:|
| `injectDiscoveryTags` → `add` → `has` (a `<meta\b[^>]*\b<attr>=` scan per tag) | 0.71 |
| `readMeta` → `metaContent` → `metaTags` | 0.32 |
| `injectDiscoveryTags` → `tagFor` → `metaTags` | 0.29 |
| `share.mjs` (already memoised, 2026-11-15) | 0.41 |

`injectDiscoveryTags` (in `addSiteChrome`, once per wrapped page) asked up to
eleven `has(attr, value)` questions, each a fresh regex over the whole page,
and up to four `tagFor` questions, each re-collecting every meta tag of the
page and compiling a matcher per tag. `readMeta` asked `metaContent` up to
four questions, each re-collecting every meta tag. 1.62 s and 0.65 s
inclusive.

## Change (`platform/pages/build.mjs`)

- `injectDiscoveryTags`: `metaTags()` keeps its last result while `next` is
  the same string (only `rewrite` changes it between questions); `tagFor`
  compiles its matcher once, not once per tag; `has` takes the `<meta…` runs
  up to their first `>` once (`/<meta\b[^>]*/gi`) and asks each question of
  those runs. Same answers: a match of the old pattern starts at some
  `<meta`, cannot cross a `>`, and so lies inside that `<meta`'s run; a
  `<meta` nested inside another's run (inside a quoted value) has a run that
  is a suffix of the outer one, so taking runs without overlap loses no
  match; `\b` sees the same neighbouring characters inside a run as in the
  page. `next` does not change while `add` runs.
- `readMeta`: collects the tags once and asks `metaContentIn(tags, …)`;
  `metaContent(html, …)` is now that over `metaTags(html)`, for its other
  callers.

Tried and dropped: `renderSearchIndex` (`writing.mjs`, 1.38 s) without its
per-post `Set` (a word is already recorded when its list ends in this post).
Same output, no measurable change (1.53 s after, noise); the time is the Map
lookups and the split, not the Set. Left as it was.

## Verification

- **Byte-identical.** Warm builds before and after, `diff -rq`: the only file
  that differs is `version.json` (`built_at`). The offline cache name, which
  hashes every built file, is `portfolio-9a2888d47b16` in both.
- Site-builder suite after the change, with a warm card cache: 2,230 tests,
  2,230 pass, 245.1 s (the 321 s reading above was a cold cache, so the two
  are not a before/after pair).

## After

Same profiler, warm, after: **49.7 s** total (one sample; before 52.9 s, also
one sample). Inclusive: `injectDiscoveryTags` 1.62 → **1.02 s**, `readMeta`
0.65 → **0.45 s**, `has` 0.75 → 0.09 s. About 0.8 s of main-thread CPU per
full build.

Wall time, three alternating unprofiled warm builds (before, after): 50.7 /
50.0, 53.9 / 55.8, 57.2 / 57.9 s. The sandbox slowed by about 7 s over the
series, and the pairs do not separate: 0.8 s is under this machine's
build-to-build noise. The profile is the number to trust here.

## Not changed, ranked for the next run

1. **The offline head injection rewrites about 9,800 pages after the finish
   walk wrote them.** `addOfflineSupport`'s `rewritePagesSync` is 2.7 s of
   `writeFileSync` plus 0.55 s of reads, and `offlineFileDigests` reads the
   whole tree again (2.2 s) just before it. Folding the injection into the
   digest pass (read once, hash the bytes as read, inject, write) keeps the
   cache name identical and saves the second read (about 0.5 s); handle
   `offline.html`, written after the digest, on its own. Folding it into
   `finishPagesInOneWalk` would save the second write too, but the cache name
   would then hash injected pages (a different name) and the injection would
   run before `addModulePreloads`, so the bytes need re-checking.
2. GC (4.6 s) and file writes (6.6 s) are the floor of writing 19k files
   and 370 MB; `pages-build-perf-2026-11-26-writing-stylesheet.md` cut bytes,
   which is the lever there.
3. `renderSearchIndex` (1.4 s): Map lookups over every word of every post;
   a cheaper tokenizer, not the dedupe, is what is left.
4. `completeShareTags` (2.4 s, `share.mjs`): already memoised; what remains is
   spread over a dozen small regexes of 0.1 to 0.35 s each.
