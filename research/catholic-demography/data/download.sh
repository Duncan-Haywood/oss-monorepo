#!/bin/sh
# GSS 1972-2024 cumulative cross-section, release 3a, from NORC at the University of Chicago
# (https://gss.norc.org/get-the-data/stata.html). About 600 MB unpacked. Raw files stay out of git.
# Set GSS_RAW to use another directory (default ./raw next to this script).
set -eu
cd "$(dirname "$0")"
here="$PWD"
RAW="${GSS_RAW:-raw}"
mkdir -p "$RAW"
cd "$RAW"
[ -f GSS_stata.zip ] || curl --fail -sSL https://gss.norc.org/content/dam/gss/get-the-data/documents/stata/GSS_stata.zip -o GSS_stata.zip
unzip -o -q GSS_stata.zip
sha256sum -c "$here/SHA256SUMS"
