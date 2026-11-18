# Pages test perf, 2026-11-18: writing-backlog matches each post once

Item 2 of the "not changed" list in
`pages-test-perf-2026-11-18-temp-dirs-and-one-read.md` named
`writing-backlog.test.mjs` (20.4 s on CI) as unprofiled.

## Reading

`node writing-backlog.mjs --json` on the real tree took 6.5 s. Phase timing
(`loadPosts`, `researchTracks`, then the matching loop, `Date.now()` around
each):

| phase | ms |
|---|---:|
| `loadPosts` (5,920 posts) | 339 |
| `researchTracks` (1,089 projects, 243 tracks) | 5 |
| matching | 5,993 |

The matching loop asked `post.body.includes(\`research/${slug}\`)` for every
slug of every track against every post: about 6.4 million substring scans of
full post bodies. The test file's CLI test runs the script twice (JSON and
text), so 13 of the file's 13.1 s locally were this loop.

## Change

`postsLinkingSlugs(posts, slugs)` scans each body once for `research/`. Every
character of a slug that matches is a character some slug uses, so a slug
matches a mention exactly when it is a prefix of the run of slug characters
that follows the mention (capped at the longest slug's length). Each post
gets the set of matching slugs; a track is covered when any of its slugs is
in a post's set. The substring rule is kept, including its prefix quirk
(`research/house-a` is "linked" by `research/house-abc/`).

## Verification

- `node writing-backlog.mjs --json` and `--all`: byte-identical to the old
  file restored from `HEAD` (`cmp`, 101,758 and 76,109 bytes).
- A new test pins `postsLinkingSlugs` against the old `includes` rule on
  prefix overlaps, nested `research/research/`, a trailing `research/`,
  case, spaces, `_` and `.` in slugs, digit-leading slugs, and no slugs.
- `node --test writing-backlog.test.mjs`: 6 of 6 pass.

## Numbers (idle container)

| | before | after |
|---|---:|---:|
| `node writing-backlog.mjs --json` (3 alternating runs) | 6.43 to 6.55 s | 0.45 to 0.50 s |
| `node --test writing-backlog.test.mjs` | 13.1 s | 1.08 s (two runs) |

## Not changed, ranked for the next run

1. `surface-budget.test.mjs` (19.5 s on CI), still unprofiled.
2. `custom-domain.test.mjs`'s 28 s build (see the earlier note).
3. `loadPosts` itself, 0.34 s per call for 5,920 posts; it grows with the
   blog, linearly, and is not worth touching yet.
