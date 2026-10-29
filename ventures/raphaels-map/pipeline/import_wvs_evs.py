#!/usr/bin/env python3
"""Import a user-downloaded Joint EVS/WVS 2017-2022 file into crosstabs.

    python3 -I pipeline/import_wvs_evs.py --file ~/private/EVS_WVS_Joint_v5.dta --out ~/private/rm-surveys

The file needs registration (GESIS or the WVS site), so we cannot fetch it and
it must never be committed (docs/dataset_imports.md). The variable mapping is
pipeline/importers/evs_wvs_2017_2022.yaml; the import refuses to run until you
have checked it against the codebook (set confirm_against_codebook: false on
each entry, or pass --i-checked-the-codebook), and stops if any mapped
variable or value label is not in the file. Writes
<out>/evs_wvs_2017_2022/crosstabs.json and questions.json in the data/surveys
shapes. Aggregates only.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gated_import  # noqa: E402

MAPPING = Path(__file__).resolve().parent / "importers" / "evs_wvs_2017_2022.yaml"

if __name__ == "__main__":
    sys.exit(gated_import.cli("evs_wvs_2017_2022", MAPPING, __doc__))
