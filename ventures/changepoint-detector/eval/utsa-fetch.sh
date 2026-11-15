#!/bin/sh
# Fetch what eval/shape-repeat.mjs reads as its fresh set into DIR (default ./utsa-data, outside
# git): the UCR Semantic Segmentation Benchmark (UTSA; Gharghabi et al., "Matrix Profile VIII",
# ICDM 2017), 32 labelled series. Its labels are in the file names (name_window_cp1[_cp2].txt).
# The data has its own terms (UCR archive), so it is never committed here. Pinned by sha256.
set -eu
DIR=${1:-utsa-data}
mkdir -p "$DIR"
URL=https://www.cs.ucr.edu/~eamonn/FLOSS/datasets_seg.zip
SHA=83013803203ce47e96e2dcbba3b858f762299441c64425c877921f41120a3d4b
[ -f "$DIR/datasets_seg.zip" ] || curl -sfSL "$URL" -o "$DIR/datasets_seg.zip"
GOT=$(sha256sum "$DIR/datasets_seg.zip" | cut -d' ' -f1)
[ "$GOT" = "$SHA" ] || { echo "datasets_seg.zip sha256 $GOT, expected $SHA" >&2; exit 1; }
[ -d "$DIR/datasets_seg" ] || (cd "$DIR" && unzip -q datasets_seg.zip)
echo "UTSA in $DIR: $(ls "$DIR"/datasets_seg/*.txt | wc -l) series"
