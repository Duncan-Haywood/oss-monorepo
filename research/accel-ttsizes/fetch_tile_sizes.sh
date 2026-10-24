#!/bin/sh
# Re-fetch Tiny Tapeout's SKY130 tile-size table (tt-support-tools, Apache-2.0) and compare with data/tile_sizes.yaml.
set -e
curl -sS -m 30 https://raw.githubusercontent.com/TinyTapeout/tt-support-tools/main/tech/sky130A/tile_sizes.yaml -o /tmp/tile_sizes.new
diff data/tile_sizes.yaml /tmp/tile_sizes.new && echo "unchanged"
