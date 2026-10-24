#!/bin/sh
set -eu
cd "$(dirname "$0")"
OPENBLAS_NUM_THREADS=1 python3 annual_acs/analyze_joint.py
python3 annual_acs/derive_first_marriage.py
OPENBLAS_NUM_THREADS=1 python3 annual_acs/analyze_first_marriage.py
OPENBLAS_NUM_THREADS=1 python3 annual_acs/independent_check.py
# Uses delivered prospective extract; run extract_annual_nlsy.py first to reacquire/re-extract raw source.
OPENBLAS_NUM_THREADS=1 python3 annual_nlsy/analyze_annual_nlsy.py
OPENBLAS_NUM_THREADS=1 python3 annual_nlsy/analyze_annual_nlsy.py --include-separated
python3 annual_nlsy/verify_annual_nlsy.py
python3 update_annual_report.py
python3 add_prospective_annual.py
python3 plot_annual.py
python3 attach_annual_figures.py
