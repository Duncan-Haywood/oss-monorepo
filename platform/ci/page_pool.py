#!/usr/bin/env python3
"""Run a per-file page check over many files on every core, in input order.

The served-page checkers (`check_control_labels.py`, `check_duplicate_ids.py`,
`check_aria_refs.py`, `check_inpage_refs.py`, `check_markup_basics.py`) each
feed ~3,700 pages (70 MB) through `html.parser`, one after another: 3 to 5 s
each, all of it CPU in one process while the runner's other cores sit idle
(docs/history/ci-perf-2026-11-12-page-checks-pool.md). Each page's result
depends only on that page, so mapping the same function over a process pool
and reading the results back in input order prints byte-identical output.

`fn` must be a module-level function (it is pickled by name) that takes a
`Path` and returns a picklable value. Small batches, unit-test roots and
platforms without `fork` run serially in this process.

    from page_pool import map_pages
    for path, result in zip(paths, map_pages(check_one, paths)): ...
"""
import multiprocessing
import os

# Below this many files the pool's start-up (~50 ms) costs more than it saves.
MIN_POOL = 64


def workers():
    """Cores this process may use (respects CPU affinity and cgroup pinning)."""
    try:
        return max(1, len(os.sched_getaffinity(0)))
    except AttributeError:  # not Linux
        return max(1, os.cpu_count() or 1)


def map_pages(fn, paths, jobs=None):
    """Return [fn(p) for p in paths], computed on up to `jobs` processes."""
    paths = list(paths)
    jobs = workers() if jobs is None else jobs
    if jobs <= 1 or len(paths) < MIN_POOL or "fork" not in multiprocessing.get_all_start_methods():
        return [fn(p) for p in paths]
    # fork: the workers inherit the imported checker, so nothing re-imports
    # `__main__` (Python 3.14 makes forkserver the default on Linux).
    ctx = multiprocessing.get_context("fork")
    # Pages range from 1 KB to over 1 MB; small chunks keep cores balanced.
    chunk = max(1, len(paths) // (jobs * 16))
    with ctx.Pool(jobs) as pool:
        return pool.map(fn, paths, chunksize=chunk)
