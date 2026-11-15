# Pages build: the blog writes each post synchronously (2026-11-15)

Perf track, `perf/0`. One change in `platform/pages/writing.mjs`.

## Reading

`ci_profile.py --runs 600 --top 25 --steps 30` (2026-11-15, about 06:00 UTC):

| workflow / job | step | runs | job-min | median |
|---|---|---|---|---|
| Portfolio Pages / test | Test the site builder | 26 | 49.0 | 133 s |
| ventures tests / changed-ventures | node --test in each touched venture | 23 | 32.8 | 52 s |
| Portfolio Pages / build | Build the site | 32 | 20.0 | 44 s |
| Portfolio Pages / build | Check the built artifact | 32 | 7.6 | 16 s |
| Portfolio Pages / build | Shed Designer gallery search | 32 | 6.6 | 14 s (P064, owner-gated) |

The two open perf backlog items (P063, P064) touch `.github/` and wait for
the owner, so this run took the largest step it could land: the site
builder's tests.

### Where the test step's time goes

`node --test` over `platform/pages` (4 cores, this container), each file
timed alone with a warm share-card cache (`PAGES_CARD_CACHE`, as CI restores
it): 306 s of CPU across 140-odd files, of which `build.test.mjs` is 191 s and
`custom-domain.test.mjs` 31 s. Both are site builds: `build.test.mjs` runs the
full catalogue twice (the shared build and the determinism child) plus a
two-venture fixture build, and `custom-domain.test.mjs` runs one more fixture
build under an apex origin. A "fixture" build still renders everything that
is not a venture: the blog (4,741 posts today), research, updates,
engineering. That suggested CPU saved inside `buildSite` would come off the step four
times per run; the before/after pair below says it does not, measurably.

### The profile

`node --cpu-prof` on one full warm build (`buildSite` with the share-card
cache warm), with self time bucketed per second of wall time under
`buildSiteInner`'s direct callee:

- Flat overall: the largest totals are `finishPagesInOneWalk` 7.2 s,
  `addSiteChrome` 6.9 s, `addOfflineSupport` 4.4 s, `writeSection` 3.7 s.
- Seconds 12 to 15, inside `writeSection` (the blog), were **about 45% idle**
  per second, with the rest in `renderPostPage`. Idle on the main thread
  means waiting.

`writeSection` did, for every post:

```js
await fs.mkdir(path.join(dir, post.slug), { recursive: true });
await fs.writeFile(path.join(dir, post.slug, 'index.html'), rebase(renderPost(...)));
```

Two awaited round trips through libuv's thread pool per post, one post at a
time: about 9,500 for the blog. The same shape `rewritePagesSync` in
`build.mjs` replaced on 2026-11-12, and `check.mjs` on 2026-11-15
(`ci-perf-2026-11-15-check-sync-page-reads.md`).

## Change

`writeSection`'s per-post loop and the agent blog's per-post `.txt` loop use
`mkdirSync` / `writeFileSync`. Nothing else in the process is in flight at
that point: the research builder started earlier is a child process
(`spawn('python3', ..., { stdio: ['ignore', 'ignore', 'inherit'] })`) with no
pipe for the blocked event loop to drain. The function stays `async` and its
callers are unchanged. The handful of index, feed and search writes before the
loop are left as they were.

## Verification

Same answers:

- `buildWriting` alone into two fresh directories, old and new code:
  `diff -r` reports nothing over 4,897 files.
- A full `buildSite` (`--base=https://example.test/site/`) with the old code
  and with the new: `diff -rq` over 29,376 files differs only in
  `version.json`, whose `built_at` is the clock.
- The whole `platform/pages` suite passes with the change (1,672 pass, 26
  skipped, 0 fail), and in the before/after pair below.

Faster (same container, same warm card cache, runs interleaved old/new):

| | before | after |
|---|---|---|
| `buildWriting` alone, first call in a process | 7.22, 7.55, 7.23 s | 5.24, 5.28, 5.58 s |
| `buildWriting` alone, later calls in the same process | 4.7 to 5.8 s | 3.4 to 4.4 s |
| full `buildSite`, warm cards | 50.7, 53.0 s | 47.7, 49.4 s |
| `platform/pages` test suite (wall) | 137.8, 137.6 s | 138.9, 133.1 s |

So about 2 s per build, roughly 6% of a full build. **The suite did not move
measurably**: its two runs each side overlap. Its four builds run beside 140
other test files on 4 cores, and 2 s of a build's wall is lost in that noise
(user time 234/239 s before, 249/232 s after). The earlier per-file CPU figure
above overstated how build-bound the suite is; the honest win here is the
build step, and the session time of anyone who builds the site. The CI figure comes from the next `ci_profile.py` reading of "Test the
site builder" (133 s median before) and "Build the site" (44 s median
before).

## Not changed, ranked for the next run

1. **The fixture builds re-render the whole blog.** `custom-domain.test.mjs`
   and `build.test.mjs`'s hub fixture each render all 4,741 posts to test two
   ventures. For `custom-domain` that is deliberate (it is the only test that
   checks posts carry no default-origin link under an apex build). The hub
   fixture's tests read `/compare/` and `/guides/`; whether they need the
   blog has not been checked. Skipping it would need a `buildSite` option and
   an argument that no hub test can fail on a post.
2. **`metaContent`'s one-slot memo misses after every `setContent`** in
   `completeShareTags`, so the `<meta>` regex rescans the whole page several
   times per page (about 2 s of `shareTagsFor`'s 3.7 s). Scanning only the
   `<head>` would be faster but changes which tags count if a body ever
   carries an `og:` meta; it would need a full-build `cmp`.
3. **The app icons are drawn once per process** (`renderIcon`, about 1.2 s),
   not cached on disk the way share cards are. Keying them on
   `rendererVersion()` through `PAGES_CARD_CACHE` would save that in every
   CI process that builds.
4. **`loadMerges` runs `git log` twice per build** (engineering and updates
   pages, about 0.4 s) and `decision_queue.py --json` three times.
5. P063 and P064 remain owner-gated (workflow files).
