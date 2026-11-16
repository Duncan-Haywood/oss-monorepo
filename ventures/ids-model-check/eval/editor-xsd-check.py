#!/usr/bin/env python3
"""Validate the IDS files the editor writes against buildingSMART's IDS 1.0 XSD.

    pip install ifctester
    node eval/editor-xsd-sample.mjs /tmp/editor-ids
    python3 eval/editor-xsd-check.py /tmp/editor-ids/*.ids

Uses IfcTester's own validator (ifctester.ids.open(path, validate=True),
which checks the file against the ids.xsd bundled with IfcTester), then counts
the specifications IfcTester reads back. Exit 1 if any file fails.
"""
import sys
import time

from ifctester import ids as idsmod

bad = 0
for path in sys.argv[1:]:
    t0 = time.time()
    try:
        spec = idsmod.open(path, validate=True)
        print(f"{path}: valid against ids.xsd, {len(spec.specifications)} specifications read ({time.time() - t0:.1f} s)")
    except Exception as e:  # noqa: BLE001 - report any validation or read failure
        bad += 1
        print(f"{path}: INVALID: {str(e)[:600]}")
sys.exit(1 if bad else 0)
