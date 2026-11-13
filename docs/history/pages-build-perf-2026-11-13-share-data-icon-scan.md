# Pages build perf, 2026-11-13: share-tag pass, one regex and one rescan

Perf track. Both open perf backlog items (P063, P064) touch workflow files, so
they wait for the owner. Took item 2 of "Not changed" in
[`pages-build-perf-2026-11-12-warm-phases.md`](pages-build-perf-2026-11-12-warm-phases.md)
("`addShareCards` with nothing to draw is 6.8 s of regex: `setContent` ...
compiles a `new RegExp` ... once per meta tag").

## Pool reading

`python3 platform/ci/ci_profile.py --runs 300 --top 20` (2026-11-13 02:29Z to
02:53Z): 294 jobs, 247.9 job-minutes, checkout 80.7. Portfolio Pages is still
the largest workflow (87.3 min over 62 jobs) and "Test the site builder" its
heaviest step (32.1 min). That suite runs several full builds, and every build
runs the share-tag pass over every page.

Local site suite before the change (`node --test "*.test.mjs"
"cloudflare/*.test.mjs"` in `platform/pages`, 4 cores, fresh card cache):
1619 tests, 1593 pass, 26 skipped, 0 fail; 5 m 23 s wall, 17 m 33 s user.

## Method

The share pass's input was captured once: a temporary env-gated `cpSync` at the
top of `addShareCards` (reverted, not committed) copied the built site just
before the pass, 9,069 HTML pages. A bench script ran the pass's per-page work
(`pageCardPlan`, then `completeShareTags`) over those pages in memory, timed it,
and hashed every plan and output page, so the old and new modules could be
compared on the same input.

## What the profile said, and what was really slow

`node --cpu-prof` on the bench put `metaContent` first (1.3 s self). That was
misleading in two ways:

- The `new RegExp` per tag in `setContent` named in the 11-12 doc was no longer
  the cost: `setContent` runs on few pages, and `metaContent` already memoised
  its matchers.
- A lower-case substring prefilter in front of each matcher, and an `&`
  fast path in `decode`, both changed nothing outside run-to-run noise
  (about ±5%). Both were dropped. Timing every `metaContent` call with
  `performance.now()` had made its found path look like 1.4 s; most of that
  was the timers themselves (2 million calls).

Per-statement timers in `completeShareTags` (one lap per top-level statement,
nine laps a page) gave the real ranking: the inline `data:` favicon strip,
**0.73 s** of 3.6 s. Its regex starts with `\s*`, so the engine tries the
pattern from every whitespace position instead of scanning for `<`; and the
`/data:/i` gate passes on most pages, since inline SVG and CSS data URIs are
common.

## Change

`platform/pages/share.mjs`:

1. The favicon strip matches `<link ... href="data:...">` without the leading
   `\s*` and trims the whitespace before each match by hand. `\s` and
   `String.prototype.trimEnd` strip the same characters (WhiteSpace and
   LineTerminator), and as with the global `replace`, a gap never reaches back
   into the previous match, so the output is the same.
2. `setContent` walks `matchAll(META)` and stops at the first matching tag,
   splicing the new tag in, instead of a `replace` over every meta tag in the
   page with a `found` flag. It uses the same cached matcher as
   `metaContent` (`metaMatcher`) instead of compiling one per tag.

## Verification

- Bench hash identical before and after (`075541f895e937c9` over all 9,069
  pages' plans and outputs).
- Full build before and after (`node build.mjs --out=<dir>`, same card cache):
  `diff -rq` over 27,135 files differs only in `version.json` (`built_at`).
- New test in `share.test.mjs`: "the data: icon strip takes the whitespace
  before each link, as the one-regex form did". It checks the old one-regex
  form against the new path on adjacent links, `shortcut icon`, upper case,
  no-break and em spaces, a link before `<head>`, and pages whose only `data:`
  is in a stylesheet link or a meta value.
- Full site suite after: 0 fail (see "After").

## After

| measure | before | after | how |
|---|---:|---:|---|
| `completeShareTags`, 9,069 pages | 3.4 to 3.8 s | 2.6 to 2.9 s | bench, 3 reps each, same process order, this container |
| plan + complete + hash, 9,069 pages | 4.4 to 5.0 s | 3.6 to 4.0 s | bench, 3 reps x 2 |

That is about 0.9 s off every full build, and the site suite runs several
builds per job (the shared build, the determinism child build, the hub
fixture). A small share of a roughly 100 s cold build; the 11-12 doc's 6.8 s
figure for this pass included reading and writing every page, which this
change does not touch.

Full site suite after the change (same command): 1620 tests, 1594 pass, 26
skipped, 0 fail (one new test). Its 1 m 46 s wall is not comparable to the
5 m 23 s before: the before run started with an empty card cache and drew
every card; the after run reused them.

## Not changed, ranked for the next run

1. **`metaContent` rescans after each `setContent`**: 15,148 full `META` scans
   for 9,069 pages (0.24 s). Patching the memo in place (the spliced tag's
   index is known) would save most of it; small.
2. **Whole-page rewrites** (item 1 of the 11-12 warm-phases doc) are still the
   larger lever: five passes each read and rewrite all ~4,500 pages.
3. The offline icons and the three `decision_queue.py` runs per build (items 3
   and 4 of the same doc).
4. P063 and P064 remain owner-gated (workflow files).
