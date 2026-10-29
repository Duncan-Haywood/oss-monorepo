# capture-trackprior: gated tracking (2026-10-29)

For the next run on track 13 audio sync. `research/capture-trackprior/gated.py` re-acquires when the unrestricted GCC
peak exceeds `ratio` x the in-prior peak. Result (4 failing clips, 1 bootstrap): lost cameras 0.368 to 0.076 (ratio 1.2) /
0.097 (1.5); wrong share 0.374 to 0.221 (1.5); good six clips 0.000 throughout. `space2` (tone, equal-height aliases) is
unchanged, so the open problem is a gate that separates aliases of equal height (a longer window or a clip-period test).
Remaining next steps are listed in the project README. The numbers are simulated delay and noise on real clips.
