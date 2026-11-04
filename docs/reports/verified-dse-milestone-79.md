# verified-dse milestone 79 (agent notes)

- Result: `research/verified-dse/experiments/detail_route/results_mult24_sub12.txt` (12 points, tau(R4,R5) 0.73).
- Reproduce: `run.py --large --points ../large/results.jsonl --designs mult24 --tag relaxed --rank-subsample 12` with Yosys 0.51 and OpenROAD 2025-03 from nixpkgs 25.05 (`nix build` of `.yosys` / `.openroad`), PDK via `research/chip-pnr/fetch_pdk.sh /tmp/pdk`. About 1 h on 4 cores.
- Trap: OpenROAD 2025-03 logs `u^2` and `worst slack` (no `max`); parsers fixed. Test a parser on one real log before a multi-hour launch.
- Next: mult32 relaxed, same subsample.
