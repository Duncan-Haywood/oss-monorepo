# Pages build: main red on a 73-character seo_title (2026-11-06)

Perf-track run. The backlog had no open `perf:` items, so I took a fresh pool
reading (`ci_profile.py --runs 200`, 181.5 job-minutes). "Test the site
builder" is the largest step (28.2 min over 40 jobs), and a red build makes
every PR re-run it.

## Finding

`node --test --test-name-pattern='catch-all|named category' build.test.mjs` on
main failed because `docs/posts/2026-11-06-ganged-windows-and-the-framing-bench.md`
had a 73-character `seo_title` (limit 70). The build throws in `loadPost`, so
every site build and test that builds the site fails.

## Change

Shortened the title to 67 characters; another run landed an equivalent shorter title on main first, so the merge kept main's version. After: 3 pass, 0 fail (before: 2 pass, 1 fail).

## Not changed (ranked)

1. The post-title gate only fires in the full build; `propose_seo_titles.py`
   could run in the posts PR check so an over-long title fails in seconds, not
   after the long build step.
2. Cold card cache build.test.mjs is still about 270 s (see 2026-11-06 reading).
