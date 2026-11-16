#!/bin/sh
# Milestone 3b: fetch three TUM RGB-D sequences (CC BY 4.0; Sturm et al., IROS 2012) and extract
# their RGB frames and motion-capture ground truth into $1 (default ./tum): fr1/desk (344 MB),
# fr1/xyz (448 MB), fr3/structure_texture_far (521 MB). Then: python3 run.py <dir>; python3 analyse.py.
set -e
D=${1:-tum}
mkdir -p "$D"
for s in freiburg1/rgbd_dataset_freiburg1_desk freiburg1/rgbd_dataset_freiburg1_xyz freiburg3/rgbd_dataset_freiburg3_structure_texture_far; do
  b=$(basename $s)
  curl -L -o "$D/$b.tgz" "https://cvg.cit.tum.de/rgbd/dataset/$s.tgz"
  tar -xzf "$D/$b.tgz" -C "$D" --wildcards '*/rgb/*' '*/rgb.txt' '*/groundtruth.txt'
  rm "$D/$b.tgz"
done
