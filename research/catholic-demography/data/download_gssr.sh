#!/bin/sh
# Fallback source for the GSS 1972-2024 cumulative file and the 2006-10 and 2016-20 panels: the data files of the
# gssr R package (Kieran Healy, https://github.com/kjhealy/gssr, built from NORC's release), fetched from GitHub when
# gss.norc.org is not reachable. Pinned to one commit and checksummed (data/SHA256SUMS.gssr). Raw files stay out of git.
set -eu
cd "$(dirname "$0")"
here="$PWD"
RAW="${GSS_RAW:-raw}"
REV=769d48c53df87e8c7bc3eecbb0432e92d5684cf1
mkdir -p "$RAW/gssr"
cd "$RAW/gssr"
for f in gss_all gss_panel06_long gss_panel08_long gss_panel10_long gss_panel20; do
  [ -f "$f.rda" ] || curl --fail -sSL "https://raw.githubusercontent.com/kjhealy/gssr/$REV/data/$f.rda" -o "$f.rda"
done
sha256sum -c "$here/SHA256SUMS.gssr"
