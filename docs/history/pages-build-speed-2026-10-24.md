# Pages: from merge to live site (2026-10-24)

The owner asked whether the GitHub Pages site should move to another
framework, language or WebAssembly to build faster and run faster, and later
about "the alleged 120 minute build". Continues
`pages-build-perf-2026-10-20.md` (PNG compression) and
`pages-test-perf-2026-10-24.md` (the test job's repeat card draws, PR #10195).

**Answer: not a rewrite.** The pages are already static HTML (median page 14.5
KB, almost no script), so WASM has nothing to speed up for visitors. In the
build, a CPU profile showed about 7 s of JavaScript doing real work out of
110 s. The rest was drawing images, waiting on the disk one file at a time,
and moving bytes that had not changed, plus a deploy that mostly did not run.

## The 120 minutes

From the API, the last 100 `Portfolio Pages` runs on `main` (10:20 to 17:47
UTC on 2026-10-24):

| conclusion | runs | median min | max min |
|---|---|---|---|
| success | 6 | 13.5 | 16.2 |
| failure | 64 | 2.9 | 20.0 |
| cancelled | 29 | 0.7 | 12.0 |

60 of the 64 failures were the step "Build the site" (the `test` job's
"Test the site builder" failed alongside it), from the same cause: a post in
`docs/posts/` with a description over 160 characters, which `loadPosts`
throws on. From each push to the next successful deploy: **median 48 minutes,
worst 169**, and 7 merges still undeployed when the window ended. So the
"two hours" was real; the build was not where it went.

## Where a passing run's time went (run 40113731255, build job)

| step | s |
|---|---|
| checkout, depth 3000 | 97 |
| `build.mjs` | 96 |
| `check.mjs` | 59 |
| development dashboard (GitHub API) | 103 |
| daily brief | 19 |
| upload artifact | 26 |
| deploy job (deploy, verify, IndexNow) | 72 |

## Inside `build.mjs`

Phase timestamps in a throwaway copy of `build.mjs` (a CPU profile is mostly
idle here: workers draw the cards, and the main thread waits on files). Local
container, 4 cores, Node 22, `--audio-cdn` on in all three, seconds:

| phase | before | after, no card cache | after, warm cache |
|---|---|---|---|
| copy and repair 1,316 tools | 12.2 | 12.3 | 9.9 |
| guides, research, writing, sitemaps | 6.9 | 5.4 | 5.0 |
| draw tool and category cards | 20.3 | 18.5 | 0.1 |
| site chrome (4,400 pages) | 13.6 | 9.4 | 10.3 |
| sponsor links | 4.8 | 4.6 | 4.4 |
| share tags and page cards | 36.5 | 34.2 | 6.4 |
| audio to jsDelivr | 3.1 | 3.2 | 4.5 |
| offline layer | 13.0 | 8.0 | 9.0 |
| **total** | **110** | **96** | **50** |

"Before" is the old code with only the audio pass added; the untouched build,
copying the MP3s, took 125 s on the same machine. `diff -rq` of the no-cache and warm-cache outputs: identical. `check.mjs`
on the warm output: "looks publishable: 1316 products, 44 category pages, 4434
pages, no dead links" (75 s).

## What changed

1. **Fail soft on a bad post, on deploys only.** `PAGES_SKIP_BAD_POSTS=1` makes
   `loadPosts` leave a malformed post out with a `::warning file=...::`
   annotation. Pull requests and the `test` job stay strict, so the post is
   still flagged; it just no longer takes the whole site with it. Fixed the two
   posts that were over the limit on arrival.
2. **Share-card cache.** `renderCards` keys each card by its options plus a
   hash of `sharecard.mjs`, `fontraster.mjs` and `fonts/`, and copies a hit
   from `PAGES_CARD_CACHE` instead of drawing. Cards drawn earlier in the same
   process are reused from memory too (PR #10195's idea, kept so the two
   compose). The workflow restores and saves the directory with
   `actions/cache`, one entry per renderer version per UTC day (the cache is
   10 GB for the whole repository; a per-run key would evict other
   workflows' caches), pruning cards no build has touched for a day. The
   cache is 143 MB for 2,740 cards. A Node upgrade that changes zlib's
   output would leave cached cards byte-different from fresh ones but
   pixel-identical; the renderer hash does not cover Node.
3. **Audio from jsDelivr.** `audio-cdn.mjs` matches every built `.mp3` to a
   committed file by git blob id, rewrites every reference in pages, feeds and
   data (resolved like a browser would, from the referring file's URL) to
   `https://cdn.jsdelivr.net/gh/<repo>@<last commit touching it>/<path>`, and
   deletes the copy. 78 files, 424 MB of the 776 MB artifact. Checked with
   curl: `200`/`206` with `content-type: audio/mpeg`, `accept-ranges: bytes`,
   `access-control-allow-origin: *`, `cache-control: ... immutable`, and the
   feed's `length` equals jsDelivr's `content-length`. Kept on Pages: files
   not committed or edited locally, over jsDelivr's 20 MB limit for GitHub
   files, or linked from nowhere; all audio when git is missing. Opt-in with
   `--audio-cdn`, which the workflow passes; local and test builds keep the
   files. GitHub release assets were the other candidate: they serve
   `application/octet-stream` with `content-disposition: attachment`, which
   Safari and some podcast apps handle badly, and they would need a workflow
   to upload them.
4. **Concurrent page passes.** `mapLimit` (share.mjs) runs the chrome pass 16
   tools at a time and the share-tag pass, offline hashing and offline
   injection 32 files at a time. Results are joined in input order, so outputs
   are unchanged. The offline cache name now hashes per-file digests rather
   than the bytes in one stream: same guarantee, a one-time different name.
5. **Workflow.** The development dashboard (103 s of GitHub API calls) starts
   in the background before the build and is copied in after `check.mjs`,
   with a 10-minute bound on the wait. The checkout is unchanged (below).

## The blob-less clone, measured and not shipped

Local container through the session proxy, depth 3000 of `main`:

| clone | fetch + checkout | `.git` |
|---|---|---|
| full | 264 s | 5.2 GB |
| `--filter=blob:none` | 59 s | 600 MB |

The daily brief (`platform/daily/collect.mjs`, `readMerges`) runs
`git log --numstat` over 14 days (seven editions and a week before them), and
`--numstat` reads both sides of every changed file. On a blob-less clone that
lazily fetched one commit's blobs at a time and had not finished after 9
minutes. A 16-day want list from `git log --raw` was 1,034,786 blobs, 95% of
them `.gz` files in `gitops/prod/front-door-tools`, the retired mirror PR #8638
removed on 2026-10-19. Marking `*.gz -diff` in the clone's own
`.git/info/attributes` lets `--numstat` print `-  -` without reading them, and
leaves a 52,355-blob want list, prefetched in 35 s (+500 MB).

That was not enough. Before a `--numstat` diff, git batch-fetches *every*
missing blob in each commit's diff queue (`diffcore_std`'s promisor prefetch),
whatever the attributes say, so the `.gz` blobs came back one commit at a time
anyway: 94 lazy fetches, `.git` past 2.9 GB, and the daily brief still running
after 119 s against 35 s on the full clone, when it was stopped. The checkout
stays a full depth-3000 clone, with a comment saying why.

Worth retrying when the front-door-tools churn has left the daily brief's
14-day window (after about 2026-11-03), or if the brief stops needing
`--numstat` (its line counts could come from the previous day's published
`facts` for every complete day but the newest). `gitops/prod/front-door`
still churns about 24k `.gz` blobs a fortnight, so measure again first.

## Not changed, ranked

1. **The `test` job** (9 minutes on a passing run) is still the slowest thing
   on a PR. It does not gate the deploy. With PR #10195's in-process cache it
   is cheaper; giving it `PAGES_CARD_CACHE` through the same `actions/cache`
   entry would make its first build cheap too.
2. **`check.mjs`** (59 s on CI, 75 s here) reads every file one at a time; the
   same `mapLimit` treatment should roughly halve it.
3. **The deploy job's 72 s** is `actions/deploy-pages` plus verification; the
   artifact is half the size now, so read it again before working on it.
4. **The checkout** (97 s): see "The blob-less clone" above.
5. **Copy and repair** (10 to 12 s) is sequential per tool; small.
