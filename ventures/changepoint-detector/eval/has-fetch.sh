#!/bin/sh
# Fetch what eval/repeat-guard.mjs reads as its fresh set into DIR (default ./has-data, outside
# git): the Human Activity Segmentation Challenge 2023 master file (250 labelled smartphone
# recordings; github.com/patrickzib/human_activity_segmentation_challenge, CC BY-NC-SA 4.0, so it
# is never committed here). Pinned by the sha256 of the zip as fetched on 2026-11-15.
set -eu
DIR=${1:-has-data}
mkdir -p "$DIR"
URL=https://raw.githubusercontent.com/patrickzib/human_activity_segmentation_challenge/main/datasets/has2023_master.csv.zip
SHA=8f65b9a726f747c819e2b906d3d4efe2276dbd5ac11b7ba110a3ecd6aca9639b
[ -f "$DIR/has2023_master.csv.zip" ] || curl -sfSL "$URL" -o "$DIR/has2023_master.csv.zip"
GOT=$(sha256sum "$DIR/has2023_master.csv.zip" | cut -d' ' -f1)
[ "$GOT" = "$SHA" ] || { echo "has2023_master.csv.zip sha256 $GOT, expected $SHA" >&2; exit 1; }
[ -f "$DIR/has2023_master.csv" ] || (cd "$DIR" && unzip -q has2023_master.csv.zip)
echo "HAS 2023 in $DIR: $(($(wc -l < "$DIR/has2023_master.csv") - 1)) recordings"
