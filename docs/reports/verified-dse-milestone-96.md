# verified-dse milestone 96 (for the next run)
- Landed: `experiments/theory/pilot_cert_guarantee.py` (+results, tests): T<1 pilot => halving returns <= pilot-best y. 0 violations; ceiling ~2.7x realised regret at m=16.
- Open: optimum-relative regret certificate (PAPER.md Section 6 item 4); detail-routed mult24/mult32 cells (~12 core-hours each); MLCAD template recheck.
- Run tests with `PY=$(python3 platform/ci/pyenv.py pytest numpy)`; bare python3 lacks pytest.
