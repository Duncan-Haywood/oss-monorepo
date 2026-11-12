# Pages build, 2026-11-12: the offline cache name reads the site synchronously

Perf track. This run first built the same test memo that
[#15026](pages-test-perf-2026-11-12-shared-walk-memo.md) landed while it was in
CI. The duplicate (PR #15029) was closed, and the run took item 2 of that note's
"Not changed" list: `changing the worker itself changes the cache name`
(about 18 s), which hashes the whole shared build three times through
`offlineCacheName` (`platform/pages/build.mjs`). Every build calls the same
function once, from `addOfflineSupport`.

## Reading

The shared build of `build.test.mjs` in this container is 26,184 files and
1.1 GB. One `offlineCacheName` call took about 4 s (three serial calls 12.3 s;
three concurrent calls 12.1 s, so running them together does not help).
Split by a scratch script over the same file list:

| step, all 26,184 files | ms |
|---|---:|
| `fs.promises.readFile`, 32 in flight (`mapLimit`) | 2,951 to 2,976 |
| callback `fs.readFile`, 32 in flight | 2,085 to 2,126 |
| `readFileSync`, one after another | 527 |
| SHA-256 of the buffers already in memory | 1,020 |
| `fs.promises` read + hash (the old code) | 3,767 to 3,780 |
| `readFileSync` + hash | 1,396 to 1,435 |
| `crypto.subtle.digest` instead of `createHash` (thread pool) | no faster |

The time was the promise API's per-file overhead on mostly small files, not
the hashing and not the disk.

## Change

`offlineCacheName` reads each file with `readFileSync` and hashes it in one
loop, in the same sorted order, feeding the same bytes (relative path, then
the file's SHA-256) into the outer hash. `buildSite` awaits
`addOfflineSupport` with nothing running beside it, so blocking the event loop
for the 1.4 s holds nothing else up.

## After

- Three calls (the test's pattern) over the same build: 12.3 s to **5.4 s**
  (4.4 s when run concurrently). Names identical before and after:
  `portfolio-760c20693adb` for `codeVersion` 'x' and `portfolio-0548a0d8acaf`
  for 'y'.
- One call, which is what every Pages build pays: about 4 s to about 1.5 s.
- The test file and CI numbers are under "Verification".

## Verification

- `node --test --test-reporter=tap build.test.mjs offline.test.mjs`: 323 of
  323 pass (296 s wall). That includes the check that a second full build in
  a child process gets the same cache name as the shared build.
- `changing the worker itself changes the cache name`: 17.6 s (warm, before
  #15026) and 18.7 s (#15026's reading) to **7.2 s**.
- Cache names identical before and after on the same tree (above).

## Not changed, ranked for the next run

1. **Other `mapLimit(files, 32, … fs.readFile …)` passes in `build.mjs`**
   (`markSponsorLinksIn` at about line 4076, the pass at 4100, the head
   injection at 11891) read every page through the promise API. They also
   write, so sync reads there would need their own measurement. The same
   per-call overhead probably applies.
2. The shared build is still about 80% of `build.test.mjs`; profile
   `buildSite` with `node --cpu-prof` on a warm cache.
3. P063 and P064 remain owner-gated (workflow files).
