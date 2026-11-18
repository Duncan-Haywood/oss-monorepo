#!/bin/sh
# Fetches the IDS files the template audit was measured on (not committed here):
#   eval/corpus/IDS-Audit-tool  buildingSMART's IDS-Audit-tool test files (MIT),
#                               pinned to the commit the README's scores used;
#   eval/corpus/real            IDS files published in public GitHub repositories
#                               (eval/real-ids-files.txt: national requirement sets,
#                               research projects, tool samples; each under its own
#                               repository's licence), at each repository's HEAD.
# Then: node eval/audit-corpus.mjs
set -e
cd "$(dirname "$0")"
mkdir -p corpus/real
COMMIT=${AUDIT_TOOL_COMMIT:-fdfc562f62c87dc8dce47a296b882e986f8e4443}
if [ ! -d corpus/IDS-Audit-tool ]; then
  git clone -q --filter=blob:none --no-checkout https://github.com/buildingSMART/IDS-Audit-tool.git corpus/IDS-Audit-tool
fi
(cd corpus/IDS-Audit-tool && git sparse-checkout set testing.shared && git checkout -q "$COMMIT")
python3 - <<'PY'
import subprocess, urllib.parse
for line in open('real-ids-files.txt'):
    repo, path = line.rstrip('\n').split(' ', 1)
    out = (repo.replace('/', '__') + '__' + path.replace('/', '_'))[:180]
    if not out.endswith('.ids'): out += '.ids'
    url = f"https://raw.githubusercontent.com/{repo}/HEAD/{urllib.parse.quote(path)}"
    subprocess.run(['curl', '-sSfL', '--max-time', '30', '-o', 'corpus/real/' + out, url], check=False)
PY
echo "fetched $(ls corpus/real | wc -l) real IDS files"
