#!/bin/sh
# Fetch what eval/tcpd.mjs reads into DIR (default ./tcpd-data, outside git by .gitignore):
# the Turing Change Point Dataset series that ship in its repository, the annotations,
# and TCPDBench's published default-experiment predictions and scores.
# Neither the series nor the predictions are committed here: several series carry
# GPL or CC BY-SA terms (see each dataset's README in the TCPD repository).
set -eu
DIR=${1:-tcpd-data}
mkdir -p "$DIR/ds"
B=https://raw.githubusercontent.com/alan-turing-institute/TCPD/master
curl -sfS "$B/annotations.json" -o "$DIR/annotations.json"
for d in $(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$DIR/annotations.json','utf8'))).join(' '))"); do
  curl -sf "$B/datasets/$d/$d.json" -o "$DIR/ds/$d.json" || rm -f "$DIR/ds/$d.json"
done
if [ ! -d "$DIR/bench" ]; then
  git clone -q --depth 1 --filter=blob:none --sparse https://github.com/alan-turing-institute/TCPDBench "$DIR/bench"
fi
cd "$DIR/bench"
git sparse-checkout set --no-cone '/abed_results/*/default_*' '/analysis/output/scores/*'
git checkout -q
cd - >/dev/null

# The series TCPD does not ship (its get_*.py scripts download them from web.archive.org, which a
# sandboxed session often cannot reach). They come from a public copy of the built files at a
# pinned commit and are kept only if their md5 matches TCPD's own checksums.json, so they are
# byte-identical to what TCPD's build produces. They go in DIR/heldout, apart from DIR/ds, so
# eval/tcpd.mjs and eval/tcpd-defaults.mjs score the same 31 series as before.
mkdir -p "$DIR/heldout"
curl -sfS "$B/checksums.json" -o "$DIR/checksums.json"
M=https://raw.githubusercontent.com/firepond/microWATCH/9f4028286f6d01a2da639622b67f0ea6f099714a/datasets/json
for d in apple bee_waggle_6 bitcoin iceland_tourism measles occupancy ratner_stock robocalls scanline_126007 scanline_42049; do
  curl -sf "$M/$d.json" -o "$DIR/heldout/$d.json" || { rm -f "$DIR/heldout/$d.json"; continue; }
  node -e "
    const fs = require('fs'), f = process.argv[1], want = [].concat(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).checksums[process.argv[3]]);
    const got = require('crypto').createHash('md5').update(fs.readFileSync(f)).digest('hex');
    if (!want.includes(got)) { fs.unlinkSync(f); console.error(process.argv[3] + ': md5 ' + got + ' not in TCPD checksums.json, dropped'); }
  " "$DIR/heldout/$d.json" "$DIR/checksums.json" "$d.json"
done
