#!/bin/sh
# Official GSS 1972-2024 cumulative cross-section (release 3a) from NORC at the University of Chicago,
# https://gss.norc.org/get-the-data/stata.html . Free to use with citation (Davern, Bautista, Freese,
# Herd and Morgan, General Social Survey 1972-2024, NORC). Raw files stay out of git.
# Set GSS_RAW to use another directory (default ./raw).
set -eu
cd "$(dirname "$0")"
RAW="${GSS_RAW:-raw}"
mkdir -p "$RAW"
[ -f "$RAW/GSS_stata.zip" ] || curl --fail -sSL https://gss.norc.org/content/dam/gss/get-the-data/documents/stata/GSS_stata.zip -o "$RAW/GSS_stata.zip"
here="$PWD"
cd "$RAW"
unzip -o -q GSS_stata.zip
sha256sum -c "$here/SHA256SUMS"
