#!/usr/bin/env python3
"""Unit tests for inherited_keys.py: object-map lookups of user input with no own-key check.

Run: python3 -m unittest test_inherited_keys   (from platform/ci/)
"""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import inherited_keys as ik

MAP = 'const PROPERTY_TYPES = { multifamily: { life: 27.5 } };\n'


class ScanText(unittest.TestCase):
    def test_flags_a_lookup_of_input_in_a_same_file_object_map(self):
        text = MAP + 'const t = PROPERTY_TYPES[input.propertyType] || PROPERTY_TYPES.multifamily;\n'
        self.assertEqual(ik.scan_text(text), [(2, "PROPERTY_TYPES[input.propertyType]")])

    def test_exported_and_frozen_maps_count(self):
        for decl in ('export const LEVELS = {', 'const LEVELS = Object.freeze({'):
            text = decl + ' a: 1 };\nconst x = LEVELS[raw.level];\n'
            self.assertEqual(len(ik.scan_text(text)), 1, decl)

    def test_an_own_key_check_on_the_line_is_not_flagged(self):
        for guard in ('Object.hasOwn(PROPERTY_TYPES, input.propertyType) ? PROPERTY_TYPES[input.propertyType] : null',
                      'PROPERTY_TYPES.hasOwnProperty(input.propertyType) && PROPERTY_TYPES[input.propertyType]'):
            self.assertEqual(ik.scan_text(MAP + f'const t = {guard};\n'), [], guard)

    def test_a_guard_for_another_map_does_not_excuse_this_one(self):
        text = MAP + 'const OTHER = { a: 1 };\nconst t = Object.hasOwn(OTHER, k) && PROPERTY_TYPES[input.propertyType];\n'
        self.assertEqual(len(ik.scan_text(text)), 1)

    def test_arrays_maps_from_elsewhere_and_bare_keys_are_not_flagged(self):
        text = ('const RATES = [1, 2];\nconst a = RATES[input.year];\n'  # an array, not an object literal
                'const b = IMPORTED[input.kind];\n'                       # not declared in this file
                + MAP + 'const c = PROPERTY_TYPES[kind];\n')              # bare identifier
        self.assertEqual(ik.scan_text(text), [])


class FakeVentures(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)

    def write(self, rel, body):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body)

    def test_tests_eval_and_node_modules_are_skipped(self):
        bad = MAP + 'PROPERTY_TYPES[input.propertyType];\n'
        for rel in ("v/calc.test.mjs", "v/eval/run.mjs", "v/node_modules/x/index.js"):
            self.write(rel, bad)
        self.write("v/calc.mjs", bad)
        self.assertEqual([h[0] for h in ik.scan_slugs(["v"], self.root)], ["ventures/v/calc.mjs"])

    def test_baseline_entries_are_not_new(self):
        self.write("v/calc.mjs", MAP + 'PROPERTY_TYPES[input.propertyType];\n')
        old = {("ventures/v/calc.mjs", "PROPERTY_TYPES[input.propertyType]")}
        self.assertEqual(ik.new_hits(["v"], self.root, baseline=old), [])
        self.assertEqual(len(ik.new_hits(["v"], self.root, baseline=set())), 1)

    def test_a_missing_venture_is_no_hits(self):
        self.assertEqual(ik.scan_slugs(["gone"], self.root), [])


class TheTree(unittest.TestCase):
    def test_no_new_unguarded_lookups(self):
        hits = ik.new_hits(ik.all_slugs())
        self.assertEqual(hits, [], "\n" + ik.report(hits))

    def test_the_baseline_has_no_stale_lines(self):
        # The ratchet: a fixed lookup must leave the baseline, so it can only shrink.
        found = {(rel, lookup) for rel, _, lookup in ik.scan_slugs(ik.all_slugs())}
        stale = sorted(ik.read_baseline() - found)
        self.assertEqual(stale, [], "fixed: delete these lines from inherited_keys_baseline.txt")

    def test_the_lookups_fixed_on_2026_11_11_stay_fixed(self):
        base = ik.read_baseline()
        for entry in [("ventures/cost-segregation-study-calculator/calc.mjs", "PROPERTY_TYPES[input.propertyType]"),
                      ("ventures/freelance-editor-quote-calculator/calc.mjs", "LEVELS[raw.level]"),
                      ("ventures/clothing-design-studio/duty.mjs", "PRODUCTS[i.product]")]:
            self.assertNotIn(entry, base)


if __name__ == "__main__":
    unittest.main()
