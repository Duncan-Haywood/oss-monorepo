# verified-dse milestone 31 (agent note)

Observational mechanism check on `fanao96` from `experiments/fanout_rich/results.jsonl`; no flow tools needed (`python3 research/verified-dse/experiments/fanao_mech/analyse.py`, instant). Finding: R2 area keeps its order (tau 0.98), R2 period does not; buffers added do not explain it; routed period has a floor. OpenROAD/Yosys are absent in cloud sessions unless fetched from the nixpkgs cache (see the project README). Open next steps: an "R2 area only" arm in the replay (needs no flow), and a fanout sweep of `fanao` (needs OpenROAD).
