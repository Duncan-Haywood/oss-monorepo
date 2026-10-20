#!/bin/sh
# Statistics Canada General Social Survey (Family) public-use microdata, CSV versions, from
# Borealis (the Canadian Dataverse Repository, borealisdata.ca; no login). Released under the
# Statistics Canada Open Licence (https://www.statcan.gc.ca/en/reference/licence).
#   Cycle 10, 1995: main file    doi:10.5683/SP3/OBQRWN  datafile 593847  (MD5 818692009375c5b10663817d54c9c9aa)
#                   union file   doi:10.5683/SP3/Z2TCKX  datafile 593909  (MD5 39a96d712fe191cbeb41acc181f39c74)
#                   child file   doi:10.5683/SP3/UW2CPG  datafile 593653  (MD5 68e123d750db44c506b5ecff29411402)
#   Cycle 20, 2006: doi:10.5683/SP3/UDCRBP  datafile 594313  (MD5 8cc9d6a0df2a626e1f68dc3ca56ca914)
#   Cycle 25, 2011: doi:10.5683/SP3/1L8L3P  datafile 594289  (MD5 24ec6548748325b20a0e25a4ed5ef469)
#   Cycle 31, 2017: doi:10.5683/SP3/U9YDJJ  datafile 594230  (MD5 daa032ac6bd83d120adfd1579d7efd54)
# About 480 MB in total. SHA256SUMS was recorded on 2026-10-20; the MD5s above are Borealis's own.
# Codebooks used for the variable definitions (not needed to run): 1995 gssc10m95cbk1.txt (593449),
# gssc10u95cbk1.txt (593507), gssc10c95cbk1.txt (593358); 2006 c20gid-ver3-eng.pdf (593757);
# 2011 c25_userguide_eng.pdf (593867); 2017 c31pumf_families_codebook_E.pdf (593831); and the
# PUMF SAS setup files (594240, 594215, 594149) for value labels.
set -eu
cd "$(dirname "$0")"
mkdir -p raw
get() {
  [ -f "raw/$2" ] && return 0
  i=0
  until curl --fail -sSL -C - "https://borealisdata.ca/api/access/datafile/$1" -o "raw/$2.part"; do
    i=$((i + 1)); [ "$i" -ge 20 ] && return 1; sleep 5
  done
  mv "raw/$2.part" "raw/$2"
}
get 593847 gss1995_main.csv
get 593909 gss1995_union.csv
get 593653 gss1995_child.csv
get 594313 gss2006.csv
get 594289 gss2011.csv
get 594230 gss2017.csv
cd raw
sha256sum -c ../SHA256SUMS
