# Pages build: `linkSiblings` in one pass (2026-10-31)

Perf track run. Reading: warm-cache Pages build (card cache set) took 53 s and
55 s local, 165 s cold. `node --cpu-prof` of the warm build: 11 s `(idle)`,
3.9 s `spawnSync`, 2.5 s GC, 2.0 s `markSample`, 1.9 s `linkSiblings`; no
single hot spot.

Change: `writing.mjs` `linkSiblings` ran one `split/join` over the whole page
per post (1,485 posts). It now makes one regex pass over the page's `href`
values and looks each up in a map built from the posts. Same answers: the
replacement never contains the repository blob prefix, so the old chain and the
lookup agree, and the first post with a given source wins in both.

Verification: microbench of 50 calls on a 40-link page: 226 ms before, 68 ms
after, byte-identical output (`cmp`). `node --test writing*.test.mjs`: 24 pass.
Whole-site `diff -rq` of a warm build before and after: no differences.
Whole-build wall clock is within noise (53 s vs 55 s): the saving is about
1 s of a 53 s build, below what one local run can resolve.

Not changed, ranked: 1. `spawnSync` 3.9 s (Python child processes); 2.
`markSample` 2.0 s in `drawMark` (the mark is the same for every card, so the
rasterised mark could be computed once per size and blitted); 3. 11 s idle
waiting on workers.
