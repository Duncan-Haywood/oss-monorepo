from __future__ import annotations

from collections.abc import Mapping


_OBSERVE_ONLY_WORKFLOW_AUTHORITY = {
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

_OBSERVE_ONLY_HANDOFF_CONTROLS = {
    "file_mutation_enabled": False,
    "copy_enabled": False,
    "retry_enabled": False,
    "cleanup_enabled": False,
    "overwrite_enabled": False,
    "materialization_enabled": False,
    "deletion_enabled": False,
}


class WorkflowAuthorityError(ValueError):
    """Raised when workflow authority metadata is malformed."""


def observe_only_workflow_authority_to_dict() -> dict[str, object]:
    """Return the structured no-authority contract for UI/agent surfaces."""

    payload: dict[str, object] = dict(_OBSERVE_ONLY_WORKFLOW_AUTHORITY)
    validate_observe_only_workflow_authority(payload, field_label="workflow_authority")
    return payload


def observe_only_handoff_controls_to_dict(
    value: object, *, field_label: str
) -> dict[str, bool]:
    """Return disabled native controls after validating an observe-only handoff."""

    if not isinstance(field_label, str) or not field_label.strip():
        raise WorkflowAuthorityError("field_label must be a non-empty string")
    if not isinstance(value, Mapping):
        raise WorkflowAuthorityError(f"{field_label} must be an object")

    validate_observe_only_workflow_authority(
        value.get("workflow_authority"),
        field_label=f"{field_label}.workflow_authority",
    )
    controls: dict[str, bool] = dict(_OBSERVE_ONLY_HANDOFF_CONTROLS)
    _validate_observe_only_handoff_controls(controls, field_label="handoff_controls")
    return controls


def validate_observe_only_workflow_authority(value: object, *, field_label: str) -> None:
    """Validate that a serialized UI/agent surface grants no workflow authority."""

    if not isinstance(field_label, str) or not field_label.strip():
        raise WorkflowAuthorityError("field_label must be a non-empty string")
    if not isinstance(value, Mapping):
        raise WorkflowAuthorityError(f"{field_label} must be an object")
    expected_keys = set(_OBSERVE_ONLY_WORKFLOW_AUTHORITY)
    actual_keys = set(value)
    if actual_keys != expected_keys:
        raise WorkflowAuthorityError(f"{field_label} has unexpected fields")
    for key, expected_value in _OBSERVE_ONLY_WORKFLOW_AUTHORITY.items():
        actual_value = value[key]
        if isinstance(expected_value, bool):
            if not isinstance(actual_value, bool) or actual_value is not expected_value:
                raise WorkflowAuthorityError(f"{field_label}.{key} must be {expected_value!r}")
            continue
        if not isinstance(actual_value, type(expected_value)):
            raise WorkflowAuthorityError(f"{field_label}.{key} must be {expected_value!r}")
        if actual_value != expected_value:
            raise WorkflowAuthorityError(f"{field_label}.{key} must be {expected_value!r}")


def _validate_observe_only_handoff_controls(
    value: object, *, field_label: str
) -> None:
    if not isinstance(field_label, str) or not field_label.strip():
        raise WorkflowAuthorityError("field_label must be a non-empty string")
    if not isinstance(value, Mapping):
        raise WorkflowAuthorityError(f"{field_label} must be an object")
    expected_keys = set(_OBSERVE_ONLY_HANDOFF_CONTROLS)
    actual_keys = set(value)
    if actual_keys != expected_keys:
        raise WorkflowAuthorityError(f"{field_label} has unexpected fields")
    for key, expected_value in _OBSERVE_ONLY_HANDOFF_CONTROLS.items():
        actual_value = value[key]
        if not isinstance(actual_value, bool) or actual_value is not expected_value:
            raise WorkflowAuthorityError(f"{field_label}.{key} must be {expected_value!r}")
