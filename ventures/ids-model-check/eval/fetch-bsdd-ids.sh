#!/bin/sh
# Fetches the public IDS files the bSDD link check was measured on (not
# committed here): eval/bsdd-ids-files.txt lists every .ids file GitHub code
# search found containing "identifier.buildingsmart.org" on 2026-11-19
# (88 files, 58 distinct), each under its own repository's licence, at each
# repository's HEAD. Then: node eval/bsdd-corpus.mjs
set -e
cd "$(dirname "$0")"
mkdir -p corpus/bsdd
python3 - <<'PY'
import subprocess, urllib.parse
for line in open('bsdd-ids-files.txt'):
    repo, path = line.rstrip('\n').split(' ', 1)
    out = (repo.replace('/', '__') + '__' + path.replace('/', '_'))[:180]
    if not out.endswith('.ids'): out += '.ids'
    url = f"https://raw.githubusercontent.com/{repo}/HEAD/{urllib.parse.quote(path)}"
    subprocess.run(['curl', '-sSfL', '--max-time', '30', '-o', 'corpus/bsdd/' + out, url], check=False)
PY
echo "fetched $(ls corpus/bsdd | wc -l) IDS files with bSDD links"
