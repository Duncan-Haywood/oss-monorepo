#!/bin/sh
# Official HCMST files from Stanford Libraries (Social Science Data Collection), linked from
# https://data.stanford.edu/hcmst and https://data.stanford.edu/hcmst2017 (downloaded 2026-10-20).
# Terms (data.stanford.edu data use agreement): do not use the data to identify individuals; do
# not charge a fee if you redistribute; inform the PI (mrosenfe@stanford.edu) about work using it;
# cite it. Raw records stay out of git (raw/ is ignored); only code, checksums and aggregates are committed.
# stacks.stanford.edu chains to "emSign Root CA - G1" (in Mozilla's root store); if your curl's CA
# bundle lacks it, pass a bundle that has it with CURL_CA_BUNDLE (e.g. python3 -m certifi).
set -eu
cd "$(dirname "$0")"
mkdir -p raw
A='https://stacks.stanford.edu/file/druid:ns183dp7831'
B='https://stacks.stanford.edu/file/druid:hg921sg6829'
get() { [ -f "raw/$2" ] || curl --fail -sSL "$1" -o "raw/$2"; }
for f in HCMST_ver_3.04_Stata.zip wave_4_supplement_v1_2.zip HCMST_wave_5_supplement_ver_1.zip \
         HCMST_wave_6_public_v1_stata.zip 'HCMST_Notes_On_Weights,_ver3.pdf' \
         HCMST_brief_user_guide_v5_June_16_2015.htm HCMST_codebook_3_04.pdf; do
  get "$A/$f" "$f"
done
get "$B/HCMST%202017%20to%202022%20small%20public%20version%202.2.dta" hcmst2017_2022_v2.2.dta
get "$B/HCMST%202017%20to%202022%20v2.2%20codebook.pdf" hcmst2017_codebook_v2.2.pdf
get "https://stacks.stanford.edu/file/druid:tq903pj6286/HCMST%202017-%202022%20user%27s%20guide%20v2.3.pdf" hcmst2017_users_guide_v2.3.pdf
cd raw
for z in HCMST_ver_3.04_Stata.zip wave_4_supplement_v1_2.zip HCMST_wave_5_supplement_ver_1.zip HCMST_wave_6_public_v1_stata.zip; do
  unzip -o -j -q "$z" '*.dta' -d .
done
sha256sum -c ../SHA256SUMS
