#!/bin/sh
# NSFG public-use respondent files used by the pooled first-marriage lens, from the official
# NCHS host. Raw files go to $NSFG_RAW (default ./raw, git-ignored); SHA256SUMS records the
# copies used on 2026-10-20. NSFG terms do not clearly allow redistribution, so only this
# script and the checksums are committed. METHODS.md lists the checks against CDC figures.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
raw=${NSFG_RAW:-$here/raw}
mkdir -p "$raw"
cd "$raw"
base='https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG'
get() { [ -f "$2" ] || curl --fail -sSL "$1" -o "$2"; }
get "$base/1995FemRespData.dat" 1995FemRespData.dat
get "$base/sas/1995FemRespSetup.sas" 1995FemRespSetup.sas
get "$base/2002FemResp.dat" 2002FemResp.dat
get "$base/stata/2002FemResp.dct" 2002FemResp.dct
get "$base/2002Male.dat" 2002Male.dat
get "$base/stata/2002Male.dct" 2002Male.dct
get "$base/2006_2010_FemResp.dat" 2006_2010_FemResp.dat
get "$base/stata/2006_2010_FemRespSetup.dct" 2006_2010_FemRespSetup.dct
get "$base/2006_2010_Male.dat" 2006_2010_Male.dat
get "$base/stata/2006_2010_MaleSetup.dct" 2006_2010_MaleSetup.dct
for c in 2011_2013 2013_2015 2015_2017 2017_2019; do
  get "$base/${c}_FemRespData.dat" "${c}_FemRespData.dat"
  get "$base/stata/${c}_FemRespSetup.dct" "${c}_FemRespSetup.dct"
  get "$base/${c}_MaleData.dat" "${c}_MaleData.dat"
  get "$base/stata/${c}_MaleSetup.dct" "${c}_MaleSetup.dct"
done
get 'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/NSFG/NSFG-2022-2023-FemRespPUFData.zip' NSFG-2022-2023-FemRespPUFData.zip
get 'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/NSFG/NSFG-2022-2023-MaleRespPUFData.zip' NSFG-2022-2023-MaleRespPUFData.zip
sha256sum -c "$here/SHA256SUMS"
