#!/usr/bin/env python3
"""Tests for portfolio/funding/validate.py."""

import unittest

from validate import validate


class FundingValidate(unittest.TestCase):
    def test_live_config_is_valid(self):
        from pathlib import Path

        import yaml

        doc = yaml.safe_load((Path(__file__).resolve().parents[2] / "portfolio" / "funding.yaml").read_text())
        self.assertEqual(validate(doc), [])


if __name__ == "__main__":
    unittest.main()
