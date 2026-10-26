# verified-dse milestone 23 (for the next run)

- Landed: TPE (BOHB model) baseline, `research/verified-dse/experiments/mf_tpe/tpe.py`, 100 seeds, about 20 minutes. Negative: no TPE arm beats never cutting on R2 (f3) or random routing; weaker than GP-EI (milestone 22). Logged with predictions written before the run (3 of 4 held).
- Time trap: the KDE arm is O(n^2) per pick; 400 seeds did not finish in 25 minutes. Run it with `run_in_background` and poll with a bounded loop (`pgrep -f '[t]pe.py'`).
- Model-based baselines for paper section 6 item 3 are now closed on pools of about 50 with R2 features. Remaining paper gaps need OpenROAD/Yosys (larger designs, a second corner, repairability features at R2, disabling repair_timing on barrel64) or full BOHB brackets on larger pools.
