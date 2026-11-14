#!/bin/sh
# Milestone 4j: fetch the two TUM RGB-D calibration sequences (CC BY 4.0, ~930 MB and ~630 MB) and
# extract their RGB frames into $1 (default ./tum). Then run prepare.py on each (see its docstring).
set -e
D=${1:-tum}
mkdir -p "$D"
for s in freiburg1/rgbd_dataset_freiburg1_rgb_calibration freiburg3/rgbd_dataset_freiburg3_calibration_rgb_depth; do
  curl -L -o "$D/$(basename $s).tgz" "https://cvg.cit.tum.de/rgbd/dataset/$s.tgz"
  tar -xzf "$D/$(basename $s).tgz" -C "$D" --wildcards '*/rgb/*' '*/rgb.txt'
done
