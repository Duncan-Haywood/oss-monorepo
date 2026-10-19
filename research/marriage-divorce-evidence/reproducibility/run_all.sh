#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Python3.11+ with requirements.txt installed. Public raw ACS/NLSY downloads total~1GB.
python3 acs/analyze_acs.py
python3 model_acs.py
python3 acs/sensitivity_acs.py
python3 acs/degree_contrasts.py
python3 acs/check_adjusted_models.py
# NSFG raw ASCII files are included. To reacquire them: sh nsfg/download.sh
python3 nsfg/analyze.py
python3 nsfg/standardize.py
python3 nsfg/pairing.py
python3 nsfg/contrasts.py
python3 nsfg/validate_contrasts.py
python3 longitudinal/extract_nlsy79.py
python3 longitudinal/analyze_nlsy79.py
python3 plot_results.py
python3 assemble_report.py
printf '%s\n' 'Analysis and report snapshot regenerated. See README.md to rebuild the report UI.'
