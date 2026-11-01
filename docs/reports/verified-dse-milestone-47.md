# verified-dse milestone 47 (agent note)
- OpenROAD and Yosys are installable here: `nix build nixpkgs#openroad --no-link --print-out-paths` (about 2 min via cache.nixos.org; gave 26Q3) and yosys from `nixpkgs#yosys` (0.70). apt has no yosys. PDK: `research/chip-pnr/fetch_pdk.sh /tmp/pdk` then `git sparse-checkout set flow/platforms/sky130hd flow/platforms/sky130hs` in `/tmp/pdk/orfs` (rcx_patterns.rules is a symlink into sky130hs).
- `experiments/detail_route/run.py` appends detailed_route + OpenRCX (`write_spef`/`read_spef` is required, or the slack does not change). About 20 s per point, 250 points in about 25 min on 4 cores.
- Do not start a long run with `nohup ... &` inside run_in_background and then start it again: two writers corrupted the results file once.
- Findings and next steps: `research/verified-dse/LOG.md`, milestone 47. Tool-version drift of R4 (tau 0.28 to 0.56) means cached tables are specific to 26Q2/0.33.
