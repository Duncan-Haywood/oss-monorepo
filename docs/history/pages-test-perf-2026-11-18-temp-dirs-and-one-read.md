# Pages tests: stop leaving 2 GB in the temp dir, and read the custom-domain build once (2026-11-18)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run took a fresh reading.

## Reading

- `ci_profile.py --runs 600 --top 25` (2026-11-18T09:40Z to 10:42Z, 618.4
  job-minutes): Portfolio Pages 208.8 min, heaviest step "Test the site
  builder" 66.3 min over 122 jobs; ventures tests 108.2 min (80.5 in
  `node --test`); checkout 195.7 min pool-wide (P063/P064 territory).
- `suite_file_times.py platform/pages --jobs 4` (this container, 4 cores):
  624 s summed, 335 s wall. `build.test.mjs` 334 s (many earlier passes),
  then **`custom-domain.test.mjs` 59.8 s for 5 tests**, then
  `writing-backlog` 20.4 s.
- ai-bookkeeper alone (`suite_file_times.py ai-bookkeeper --jobs 4`): 115.7 s
  summed over 342 files, slowest 3.8 s; start-up bound, no single lever
  (`rowWidths` in `xls-receipts-fuzz.test.mjs` scans 226 M characters of
  reader output, about 1.3 s; a typed-array scan saves about 0.6 s; not
  taken, see below).

## Finding 1: the suites leave about 2 GB behind per run

After one Pages suite run, `du -sh /tmp/*`:

| left behind | size | made by |
|---|---:|---|
| `pages-build-*` | 1.6 GB | `build.test.mjs` shared build (its `after` removed only the hub fixture) |
| `apex-*` | 352 MB | `custom-domain.test.mjs` fixture build (never removed) |
| `audio-cdn-big-*` | 62 MB | `audio-cdn.test.mjs` 20 MB-limit test |
| `deploy-*` | 112 MB | `platform/deploy/build.test.mjs` (seven `mkdtemp`s, none removed) |

A cloud session's disk is a fixed allowance (`df` misleads; "no space left on
device" is the symptom). Three runs of the Pages suite in one session spend
about 6 GB of it on dead build output. On a runner the temp dir is thrown
away, so CI minutes do not change; sessions are where this bites.

**Change.** `build.test.mjs`'s `after` also removes the shared build;
`custom-domain.test.mjs` gets an `after` that removes its fixture;
`audio-cdn.test.mjs` removes its two big dirs in a `finally`;
`platform/deploy/build.test.mjs` records each `tmp()` dir and removes them
all in an `after`. No assertion changed.

**Verification.** `rm` the old dirs, then
`node --test "*.test.mjs" "cloudflare/*.test.mjs"` in `platform/pages`:
1824 tests, 1824 pass, 350 s wall; the largest directory left in `/tmp`
afterwards is 4 MB (`page-identity-*`). `platform/deploy`: 12 pass, no
`deploy-*` dir left.

## Finding 2: custom-domain swept its 8,500-file build three times

The file builds one fixture site (posts, research and two ventures: 8,493
files, 352 MB), then three tests each walk the whole tree and re-read every
text file: about 2.2 s a sweep (`duration_ms` of tests 2 and 5; test 1 also
pays for the build).

**Change.** `sweep()` walks and reads once, memoised, and keeps per file only
what the tests ask (default-origin link hit, placeholder hit, canonical
hrefs), not the bodies. Same file filter, same regexes, same assertions and
messages.

**Numbers** (`node --test custom-domain.test.mjs`, idle container, three
alternating runs each, the old file restored from `HEAD` beside the new):

| | wall | tests 2 / 5 |
|---|---:|---|
| before | 34.2 s (33.7, 34.2, 35.7) | 2.2 to 2.4 s each |
| after | 31.0 s (30.6, 31.0, 32.3) | 2 ms / 40 to 54 ms |

About 3 s a run, 9% of the file; the rest is the build.

## Not changed, ranked for the next run

1. `custom-domain.test.mjs`'s build (about 28 s): it builds posts and the
   research tree because the sweep asserts no origin leak anywhere in them.
   Sharing `build.test.mjs`'s build is not possible as is (different base
   URL, and buildSite keeps module-level state); a child process beside it
   would overlap the two on CI.
2. `writing-backlog.test.mjs` 20.4 s and `surface-budget.test.mjs` 19.5 s,
   unprofiled.
3. ai-bookkeeper `rowWidths`: `Buffer.from(csv, 'utf8')` and a byte loop
   would be exact (UTF-8 continuation bytes are all >= 0x80, so `"`, `,`
   and `\n` match only themselves) and about 0.6 s faster; small. The cause
   is the reader padding every row to a damaged cell's column 65535 (20 MB
   CSVs; `ci-perf-2026-11-13-xls-row-padding.md`), a product question, not a
   test one.
4. Other suites that `mkdtemp` and never remove: `writing-paged-*`,
   `page-identity-*` (a few MB each), and outside `platform/pages`
   unsurveyed.
