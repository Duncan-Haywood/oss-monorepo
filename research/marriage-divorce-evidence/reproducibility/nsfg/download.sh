#!/bin/sh
set -eu
cd "$(dirname "$0")"
base='https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG'
curl --fail -L "$base/2017_2019_FemRespData.dat" -o female.dat
curl --fail -L "$base/2017_2019_MaleData.dat" -o male.dat
curl --fail -L "$base/stata/2017_2019_FemRespSetup.dct" -o female.dct
curl --fail -L "$base/stata/2017_2019_MaleSetup.dct" -o male.dct
for sex in FemResp Male; do
 case "$sex" in FemResp) prefix=female; rel=I;; Male) prefix=male; rel=J;; esac
 curl --fail -L "https://www.cdc.gov/nchs/data/nsfg/2017-2019_NSFG_${sex}_SectionRecodes_Codebook-508.pdf" -o "${prefix}_recodes.pdf"
 curl --fail -L "https://www.cdc.gov/nchs/data/nsfg/2017-2019_NSFG_${sex}_Section${rel}_Codebook-508.pdf" -o "${prefix}_religion.pdf"
done
curl --fail -L https://www.cdc.gov/nchs/data/nsfg/NSFG-2017-2019-UG-MainText-508.pdf -o userguide.pdf
curl --fail -L https://www.cdc.gov/nchs/data/nsfg/2017-2019_NSFG_FemResp_SectionC_Codebook-508.pdf -o female_marriage.pdf
curl --fail -L https://www.cdc.gov/nchs/data/nsfg/NSFG-PUF2017-2019-FemC-CRQ-508.pdf -o female_marriage_questionnaire.pdf
