# Pages build broken on main by a 175-character post description (2026-11-03)

Reading: `python3 platform/ci/ci_profile.py --runs 600` put Portfolio Pages
(273 of 568 job-minutes) first again. Starting a local build to profile it
failed in `writing.mjs`: `docs/posts/2026-11-03-einvoice-preflight-new-zealand.md`
(PR #12729) had a 175-character description, limit 160. Every Pages build,
test and deploy on `main` fails on this until fixed.

Change: description shortened to 154 characters; same facts minus "central" and
the full date. Verified: `node platform/pages/build.mjs --out=/tmp/site`
completes (1 m 57 s, 4 cores, cold card cache).

CI timings from the 300-run reading (per-job averages): "Test the site
builder" 219 s over 13 jobs even with the card cache restored; "Check the
built artifact" 61 s over 18; build-job checkout 34 s (full history for
`lastmod`, deliberate). Not changed, ranked: 1) why the cache-restored test
step still takes 219 s (the cache may be missing on PR runs; check the restore
step's `cache-hit` output); 2) `check.mjs` at 61 s (21 s locally);
3) the earlier recurring cause: front-matter limits are only checked by the
build. `check_post_frontmatter.py` as a pre-merge gate would stop this class.
