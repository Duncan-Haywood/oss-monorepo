import unittest

from shootflow import workflow_authority
from shootflow.workflow_authority import WorkflowAuthorityError


OBSERVE_ONLY_WORKFLOW_AUTHORITY = {
    "mode": "observe_only",
    "handoff_kind": "presentation_only",
    "permits_file_mutation": False,
    "permits_copy": False,
    "permits_retry": False,
    "permits_cleanup": False,
    "permits_overwrite": False,
    "permits_materialization": False,
    "permits_deletion": False,
}


DISABLED_NATIVE_CONTROLS = {
    "file_mutation_enabled": False,
    "copy_enabled": False,
    "retry_enabled": False,
    "cleanup_enabled": False,
    "overwrite_enabled": False,
    "materialization_enabled": False,
    "deletion_enabled": False,
}


class WorkflowAuthorityTests(unittest.TestCase):
    def test_handoff_controls_stay_disabled_despite_next_action_prose(self) -> None:
        reader = self._handoff_controls_reader()
        payload = {
            "schema_version": 2,
            "workflow_authority": dict(OBSERVE_ONLY_WORKFLOW_AUTHORITY),
            "next_actions": [
                {
                    "name": "dry-run-render-scheduler",
                    "writes_files": True,
                    "workspace": "/Volumes/Shoots/wedding-a",
                }
            ],
            "next_steps": [
                "After human review, run python -m shootflow.cli dry-run-render-scheduler"
            ],
            "agent_handoff": {
                "summary": "Ready for review; do not enable retry or materialization controls."
            },
        }

        controls = reader(payload, field_label="scheduler_handoff")

        self.assertEqual(controls, DISABLED_NATIVE_CONTROLS)

    def test_handoff_controls_reject_missing_root_authority(self) -> None:
        reader = self._handoff_controls_reader()

        with self.assertRaisesRegex(
            WorkflowAuthorityError,
            "scheduler_handoff.workflow_authority must be an object",
        ):
            reader({"schema_version": 2, "next_steps": []}, field_label="scheduler_handoff")

    def test_handoff_controls_reject_authorizing_root_payload(self) -> None:
        reader = self._handoff_controls_reader()
        payload = {
            "schema_version": 2,
            "workflow_authority": {
                **OBSERVE_ONLY_WORKFLOW_AUTHORITY,
                "permits_copy": True,
            },
        }

        with self.assertRaisesRegex(
            WorkflowAuthorityError,
            "scheduler_handoff.workflow_authority.permits_copy must be False",
        ):
            reader(payload, field_label="scheduler_handoff")

    def _handoff_controls_reader(self):
        reader = getattr(workflow_authority, "observe_only_handoff_controls_to_dict", None)
        self.assertTrue(callable(reader))
        return reader
