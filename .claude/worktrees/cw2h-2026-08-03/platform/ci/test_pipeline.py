#!/usr/bin/env python3
"""
Unit tests for the Monorepo Universal CI Pipeline Engine.
Verifies component discovery, delta change detection, provider context detection, and execution logic.
"""

import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
sys.path.insert(0, str(Path(__file__).parent))
from pipeline import CIPipelineEngine

class TestCIPipelineEngine(unittest.TestCase):
    def setUp(self):
        self.engine = CIPipelineEngine(verbose=False)

    def test_detect_provider(self):
        old_env = dict(os.environ)
        try:
            os.environ.pop("GITEA_ACTIONS", None)
            os.environ.pop("GITEA_SERVER_URL", None)
            os.environ.pop("GITHUB_ACTIONS", None)

            self.assertEqual(self.engine._detect_provider(), "local")

            os.environ["GITHUB_ACTIONS"] = "true"
            self.assertEqual(self.engine._detect_provider(), "github")

            os.environ["GITEA_ACTIONS"] = "true"
            self.assertEqual(self.engine._detect_provider(), "gitea")
        finally:
            os.environ.clear()
            os.environ.update(old_env)

    def test_discover_components(self):
        components = self.engine.discover_components()
        self.assertIsInstance(components, list)
        self.assertGreater(len(components), 0)

        types = {c["type"] for c in components}
        self.assertIn("node", types)
        self.assertIn("python", types)

        dirs = {c["dir"] for c in components}
        self.assertIn("ventures/quick-pick-survey", dirs)
        self.assertIn("ventures/photo-editing", dirs)

    def test_filter_components_to_run_force_all(self):
        components = self.engine.discover_components()
        filtered = self.engine.filter_components_to_run(components, force_all=True)
        self.assertEqual(len(filtered), len(components))

    def test_filter_components_with_no_changes(self):
        components = self.engine.discover_components()
        # Mock empty changed files
        self.engine.get_changed_files = lambda: set()
        filtered = self.engine.filter_components_to_run(components, force_all=False)
        self.assertEqual(len(filtered), len(components))

    def test_filter_components_with_specific_venture_change(self):
        components = self.engine.discover_components()
        self.engine.get_changed_files = lambda: {"ventures/quick-pick-survey/src/index.ts"}
        filtered = self.engine.filter_components_to_run(components, force_all=False)
        
        filtered_dirs = [c["dir"] for c in filtered]
        self.assertIn("ventures/quick-pick-survey", filtered_dirs)
        self.assertNotIn("ventures/photo-editing", filtered_dirs)

    def test_filter_components_with_global_change(self):
        components = self.engine.discover_components()
        self.engine.get_changed_files = lambda: {"scripts/verify-all.sh"}
        filtered = self.engine.filter_components_to_run(components, force_all=False)
        self.assertEqual(len(filtered), len(components))

if __name__ == "__main__":
    unittest.main()
