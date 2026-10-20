#!/bin/sh
# NLSY97 public release, rounds 1-21 (1997-2023/24), all variables, from the BLS NLS program.
# Public data: no login, no restricted geocode. The zip holds an 8.1 GB CSV with 305,325 columns;
# nothing here unzips it. select_vars.py and extract.py STREAM the needed columns into $NLSY97_WORK
# (about 210 MB of person-level extract that must stay out of git).
# Checksum recorded 2026-10-20 (server Last-Modified 2026-01-23, 475,462,343 bytes).
set -eu
cd "$(dirname "$0")"
WORK="${NLSY97_WORK:-$(pwd)/work}"
mkdir -p "$WORK"
ZIP="$WORK/nlsy97_all_1997-2023.zip"
[ -f "$ZIP" ] || curl --fail -sSL https://nlsinfo.org/cohort-data/nlsy97_all_1997-2023.zip -o "$ZIP"
(cd "$WORK" && sha256sum -c "$OLDPWD/SHA256SUMS")
python3 -I select_vars.py "$ZIP" "$WORK"
python3 -I extract.py "$ZIP" "$WORK/vars.txt" "$WORK/extract.csv"
python3 -I extract.py "$ZIP" "$WORK/vars_hhi.txt" "$WORK/extract_hhi.csv"
python3 -I select_vars_ext.py "$ZIP" "$WORK"            # 2026-10-20 extension columns
python3 -I extract.py "$ZIP" "$WORK/vars_ext.txt" "$WORK/extract_ext.csv"
echo "now: NLSY97_WORK=$WORK python3 train_models.py  (then extended_predictors.py)"
