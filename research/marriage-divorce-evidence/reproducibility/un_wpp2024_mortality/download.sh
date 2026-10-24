#!/bin/sh
# UN World Population Prospects 2024, single-year death rates by age and sex (mx1dt) and life
# expectancy at birth (e01dt), from the wpp2024 R data package (PPgp/wpp2024 on GitHub,
# maintained for the UN Population Division), pinned to commit 2da7768. mx1dt.rda is 87 MB and
# stays out of git. Data (c) 2024 United Nations, DESA, Population Division, CC BY 3.0 IGO.
set -eu
cd "$(dirname "$0")"
mkdir -p raw
base='https://raw.githubusercontent.com/PPgp/wpp2024/2da7768ae64fc74105d3f9e98f9a74d37b62f99a/data'
for f in mx1dt.rda e01dt.rda; do
  [ -f "raw/$f" ] || curl --fail -sSL "$base/$f" -o "raw/$f"
done
cd raw && sha256sum -c ../SHA256SUMS
