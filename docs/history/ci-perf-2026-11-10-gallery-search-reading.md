# CI perf, 2026-11-10: P064 is not closed, the gallery search is 12 s cold

The earlier 2026-11-10 note (`ci-perf-2026-11-10-pool-and-page-weight-reading.md`)
calls P064 landed. Only half of it did: the three searches run in worker threads
(`ci-perf-2026-11-09-gallery-search-threads.md`), but a fresh runner still has no
`.gallery-stamp`, so every Pages build job pays the search. The workflow change that
would remove it is in `.github/workflows/portfolio-pages.yml`, owner-gated.

## Reading (local, clean stamp, `main` at 179109a5)

| command | wall | user |
|---|---|---|
| `make-gallery.mjs --check` | 12.0 s | 38.2 s |
| `make-gallery.mjs` (writes) | 12.5 s | 38.4 s |

Both leave `gallery-data.mjs` byte-identical (`git status` clean), so the committed
file equals the search output: the safety condition P064 asked to confirm before a
stamp cache holds on `main` today. Before the thread change the cold run was 25.7 s,
so the per-job cost in CI is now about 12 s, not 19 s.

## Not changed

The P064 cache step (owner-gated). The backlog row now carries these numbers and
stays open.
