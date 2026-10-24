#!/bin/sh
# Official GSS files from NORC at the University of Chicago (https://gss.norc.org/get-the-data/stata.html):
#   GSS_2006_Panel_Stata.zip, GSS_2008_Panel_stata.zip, GSS_2010_Panel_stata.zip  three-wave panels
#   GSS_2020_panel_stata_1a.zip  2016-2020 panel (release 1a) and its codebook
#   GSS_stata.zip                cumulative 1972-2024 cross-sections (gss7224_r3a.dta; cross_section.py only)
# Raw files stay out of git; only scripts, checksums and aggregate outputs are committed.
# Set GSS_RAW to use another directory (default ./raw).
set -eu
cd "$(dirname "$0")"
RAW="${GSS_RAW:-raw}"
mkdir -p "$RAW"
B=https://gss.norc.org/content/dam/gss/get-the-data/documents/stata
for f in GSS_2006_Panel_Stata.zip GSS_2008_Panel_stata.zip GSS_2010_Panel_stata.zip GSS_2020_panel_stata_1a.zip GSS_stata.zip; do
  [ -f "$RAW/$f" ] || curl --fail -sSL "$B/$f" -o "$RAW/$f"
done
here="$PWD"
cd "$RAW"
for f in *.zip; do unzip -o -q "$f"; done
# Archives and the extracted .dta files (NORC re-issues archives occasionally; the .dta lines are what the analysis needs).
sha256sum -c "$here/SHA256SUMS"
