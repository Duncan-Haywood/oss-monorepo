#!/usr/bin/env python3
"""Rebuild source_cache/ (git-ignored) for every source in sources.py, using
../literature_evidence/scripts/fetch_sources.py. Network required; repo sources need nothing.

    python3 scripts/fetch_sources.py [--only KEY ...]
"""
import argparse, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FETCH = os.path.join(ROOT, '..', 'literature_evidence', 'scripts', 'fetch_sources.py')
sys.path.insert(0, HERE)
from sources import SOURCES  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*')
    ap.add_argument('--cache', default=os.path.join(ROOT, 'source_cache'))
    a = ap.parse_args(argv)
    for k, meta in SOURCES.items():
        if 'fetch' not in meta or (a.only and k not in a.only):
            continue
        if all(os.path.exists(os.path.join(a.cache, f)) for f in meta['cache_files']):
            continue
        subprocess.run([sys.executable, FETCH, *meta['fetch'], '--cache', a.cache], check=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
