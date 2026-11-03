# Pages build: skip the star-polygon walk outside its reach (2026-11-02)

**Reading.** `ci_profile.py --runs 600`: Portfolio Pages is 252 of 666 job-minutes;
"Test the site builder" is 98 of them. Per-file wall time (cold card cache, 4 cores):
`build.test.mjs` hit the 300 s cap, `custom-domain.test.mjs` 86 s (33 s with a warm
card cache, as CI has), everything else under 11 s. A warm `--cpu-prof` of
`custom-domain.test.mjs` had `markSample` (sharecard.mjs) as the top self-time
function, 3.9 s, ahead of `spawnSync` 3.2 s.

**Change.** `markSample` ran two point-in-polygon walks on every sample, including
the ~21% of samples outside the disc and the many between the star tips. Each star
is the convex hull of vertices within a known radius, so a sample farther than that
radius cannot be inside it. `markSample` now returns `null` beyond the disc and
walks a star only inside its reach (+0.001 for the 4-decimal vertex rounding).

**Verify.** SHA-256 over `drawMark` output for 11 sizes x plate on/off:
`274c8bba5d59878d` before and after (byte-identical). Same script, wall time:
18.8 s before, 10.4 s after (-45%). `share.test.mjs` and sharecard tests: 28/28 pass.

**Not changed, ranked.** 1. `build.test.mjs` exceeds 300 s cold: its per-test DOM work
is the next profile. 2. `custom-domain.test.mjs` rebuilds the whole site for a
five-assertion check; a smaller fixture of non-venture content would cut it.
3. `spawnSync` (3.2 s warm) is `python3` and `ls` children in `build.mjs`.
