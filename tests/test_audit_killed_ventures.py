#!/usr/bin/env python3
"""Tests for audit_killed_ventures CI script.

Ensures that any venture triggering a kill criterion fails the audit unless it has been
transitioned to `stage: winding-down` or has a valid, active human decision override.
"""

import sys
import tempfile
import unittest
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from audit_killed_ventures import audit_killed_ventures


class TestAuditKilledVentures(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.tmp_dir.name)
        self.ventures_dir = self.repo_root / "ventures"
        self.ledger_dir = self.repo_root / "portfolio" / "ledger"
        self.ventures_dir.mkdir(parents=True)
        self.ledger_dir.mkdir(parents=True)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _create_venture(
        self,
        name: str,
        stage: str = "prototype",
        kill_criteria: list = None,
        kill_criteria_overrides: list = None,
    ):
        v_dir = self.ventures_dir / name
        v_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "name": name,
            "stage": stage,
            "owner": "test-owner",
            "kill_criteria": kill_criteria or [],
            "kill_criteria_overrides": kill_criteria_overrides or [],
            "budget": {"monthly_cap": 100, "protected": True},
            "economics": {"mrr": 0, "monthly_cost": 10},
        }
        with open(v_dir / "VENTURE.yaml", "w", encoding="utf-8") as f:
            yaml.dump(manifest, f)

    def _write_ledger(self, month: str, entries: list):
        with open(self.ledger_dir / f"{month}.yaml", "w", encoding="utf-8") as f:
            yaml.dump({"period": month, "entries": entries}, f)

    def test_audit_passes_when_all_ventures_healthy(self):
        self._create_venture(
            "healthy-venture",
            kill_criteria=[
                {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": 500}
            ],
        )
        self._write_ledger("2026-07", [{"venture": "healthy-venture", "agent_spend_usd": 50.0, "mrr_end": 0}])

        code = audit_killed_ventures(self.repo_root)
        self.assertEqual(code, 0)

    def test_audit_fails_when_venture_killed_without_override(self):
        self._create_venture(
            "breached-venture",
            kill_criteria=[
                {
                    "description": "Spend ceiling reached",
                    "metric": "cumulative_agent_spend_usd",
                    "comparator": ">=",
                    "threshold": 100,
                }
            ],
        )
        self._write_ledger("2026-07", [{"venture": "breached-venture", "agent_spend_usd": 150.0, "mrr_end": 0}])

        code = audit_killed_ventures(self.repo_root)
        self.assertEqual(code, 1)

    def test_audit_passes_when_killed_venture_is_winding_down(self):
        self._create_venture(
            "winding-venture",
            stage="winding-down",
            kill_criteria=[
                {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": 100}
            ],
        )
        self._write_ledger("2026-07", [{"venture": "winding-venture", "agent_spend_usd": 150.0, "mrr_end": 0}])

        code = audit_killed_ventures(self.repo_root)
        self.assertEqual(code, 0)

    def test_audit_passes_when_killed_venture_has_valid_override(self):
        self._create_venture(
            "overridden-venture",
            kill_criteria=[
                {
                    "description": "Spend ceiling reached",
                    "metric": "cumulative_agent_spend_usd",
                    "comparator": ">=",
                    "threshold": 100,
                }
            ],
            kill_criteria_overrides=[
                {
                    "criterion": "Spend ceiling reached",
                    "owner": "duncan",
                    "reason": "Pivot testing approved by lead",
                    "expiry": "2099-12-31",
                }
            ],
        )
        self._write_ledger("2026-07", [{"venture": "overridden-venture", "agent_spend_usd": 150.0, "mrr_end": 0}])

        code = audit_killed_ventures(self.repo_root)
        self.assertEqual(code, 0)

    def test_audit_fails_when_killed_venture_has_expired_override(self):
        self._create_venture(
            "expired-venture",
            kill_criteria=[
                {
                    "description": "Spend ceiling reached",
                    "metric": "cumulative_agent_spend_usd",
                    "comparator": ">=",
                    "threshold": 100,
                }
            ],
            kill_criteria_overrides=[
                {
                    "criterion": "Spend ceiling reached",
                    "owner": "duncan",
                    "reason": "Temporary extension expired",
                    "expiry": "2020-01-01",
                }
            ],
        )
        self._write_ledger("2026-07", [{"venture": "expired-venture", "agent_spend_usd": 150.0, "mrr_end": 0}])

        code = audit_killed_ventures(self.repo_root)
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
