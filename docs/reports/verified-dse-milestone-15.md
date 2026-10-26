# verified-dse milestone 15 (2026-10-26)

For the next run: the larger non-arithmetic table is `research/verified-dse/experiments/nonarith/results.jsonl` (600 flow runs, replayable without tools). The R2-cut floor is driven by one design per family (barrel64 here), so the open step is a pilot statistic that flags such designs (LOG.md, "Next").

Toolchain recipe that worked in a cloud session: `apt-get install -y yosys`; `research/chip-pnr/fetch_pdk.sh /tmp/pdk`; OpenROAD from nix needs a source build (about 1.5 h on 4 cores; the `doCheck=false` override is not in the binary cache). Run `nix build` with `run_in_background` and a 2 h timeout (the default 30 min kills it, and the build restarts). The 600-run experiment then took about 35 min.
