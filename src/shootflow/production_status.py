from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.production import ProductionJob, ProductionPlan

ProductionJobState = Literal["pending", "running", "succeeded", "failed", "retryable"]
PRODUCTION_STATUS_MANIFEST_PATH = "production_status.json"
_PRODUCTION_STATUS_SCHEMA_VERSION = 1

_MANIFEST_KEYS = frozenset(
    {"schema_version", "shoot_slug", "production_plan_fingerprint", "job_statuses"}
)
_STATUS_KEYS = frozenset(
    {
        "job_id",
        "state",
        "worker_adapter",
        "attempts",
        "error_message",
        "output_checksums",
        "updated_at",
    }
)
_CHECKSUM_KEYS = frozenset({"path", "sha256"})
_STATES = frozenset({"pending", "running", "succeeded", "failed", "retryable"})
_WORKER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class ProductionStatusError(ValueError):
    """Raised when production-worker status cannot be trusted."""


@dataclass(frozen=True)
class OutputChecksum:
    path: str
    sha256: str


@dataclass(frozen=True)
class ProductionJobStatus:
    job_id: str
    state: ProductionJobState
    worker_adapter: str | None = None
    attempts: int = 0
    error_message: str | None = None
    output_checksums: tuple[OutputChecksum, ...] = ()
    updated_at: str | None = None


@dataclass(frozen=True)
class ProductionStatusManifest:
    shoot_slug: str
    production_plan_fingerprint: str
    job_statuses: tuple[ProductionJobStatus, ...]


@dataclass(frozen=True)
class ProductionStatusInitializationResult:
    manifest_path: Path
    manifest: ProductionStatusManifest
    created: bool


def production_plan_fingerprint(trusted_plan: ProductionPlan) -> str:
    _validate_trusted_plan(trusted_plan)
    raw_fingerprint_input = {
        "shoot_slug": trusted_plan.shoot_slug,
        "jobs": [_trusted_job_fingerprint_input(job) for job in trusted_plan.jobs],
    }
    encoded = json.dumps(
        raw_fingerprint_input,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_initial_production_status_manifest(trusted_plan: ProductionPlan) -> ProductionStatusManifest:
    _validate_trusted_plan(trusted_plan)
    return ProductionStatusManifest(
        shoot_slug=trusted_plan.shoot_slug,
        production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
        job_statuses=tuple(
            ProductionJobStatus(job_id=job.job_id, state="pending")
            for job in trusted_plan.jobs
        ),
    )


def validate_production_status_manifest(
    manifest: ProductionStatusManifest,
    *,
    trusted_plan: ProductionPlan,
) -> None:
    _validate_manifest(manifest, trusted_plan=trusted_plan)


def write_production_status_manifest(
    manifest: ProductionStatusManifest,
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
) -> Path:
    _validate_manifest(manifest, trusted_plan=trusted_plan)

    manifest_path = _production_status_manifest_path(workspace_root)
    root = Path(workspace_root)
    _reject_symlink_path(manifest_path.parent, root, "production status manifest directory")
    try:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ProductionStatusError(
            f"Unable to create production status manifest directory: {manifest_path.parent}"
        ) from exc
    _reject_symlink_path(manifest_path.parent, root, "production status manifest directory")
    _reject_symlink_path(manifest_path, root, "production status manifest")

    _write_manifest_text(manifest_path, root=root, content=_manifest_json(manifest))
    return manifest_path


def load_production_status_manifest(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
) -> ProductionStatusManifest:
    _validate_trusted_plan(trusted_plan)

    manifest_path = _production_status_manifest_path(workspace_root)
    root = Path(workspace_root)
    _reject_symlink_path(manifest_path.parent, root, "production status manifest directory")
    _reject_symlink_path(manifest_path, root, "production status manifest")
    _reject_symlink_path(
        manifest_path.with_suffix(".json.tmp"),
        root,
        "temporary production status manifest",
    )

    manifest = _manifest_from_json(_read_json_object(manifest_path))
    _validate_manifest(manifest, trusted_plan=trusted_plan)
    return manifest


def initialize_production_status_manifest(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
) -> ProductionStatusInitializationResult:
    """Create or load the trusted production-status handoff without resetting progress."""

    _validate_trusted_plan(trusted_plan)
    root = Path(workspace_root)
    manifest_path = _production_status_manifest_path(root)
    with _production_status_manifest_lock(root):
        _reject_symlink_path(manifest_path.parent, root, "production status manifest directory")
        _reject_symlink_path(manifest_path, root, "production status manifest")
        _reject_symlink_path(
            manifest_path.with_suffix(".json.tmp"),
            root,
            "temporary production status manifest",
        )
        if manifest_path.exists():
            manifest = load_production_status_manifest(root, trusted_plan=trusted_plan)
            return _initialization_result(
                manifest_path=manifest_path,
                manifest=manifest,
                created=False,
                trusted_plan=trusted_plan,
            )

        manifest = build_initial_production_status_manifest(trusted_plan)
        written_path = write_production_status_manifest(manifest, root, trusted_plan=trusted_plan)
        loaded_manifest = load_production_status_manifest(root, trusted_plan=trusted_plan)
        return _initialization_result(
            manifest_path=written_path,
            manifest=loaded_manifest,
            created=True,
            trusted_plan=trusted_plan,
        )


@contextmanager
def _production_status_manifest_lock(workspace_root: Path | str) -> Iterator[None]:
    root = Path(workspace_root)
    manifest_path = _production_status_manifest_path(root)
    _reject_symlink_path(manifest_path.parent, root, "production status lock directory")
    try:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ProductionStatusError(
            f"Unable to create production status lock directory: {manifest_path.parent}"
        ) from exc
    _reject_symlink_path(manifest_path.parent, root, "production status lock directory")

    lock_path = manifest_path.with_suffix(".json.lock")
    _reject_symlink_path(lock_path, root, "production status lock")
    flags = os.O_RDWR | os.O_CREAT
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(lock_path, flags, 0o600)
    except OSError as exc:
        raise ProductionStatusError(f"Unable to open production status lock: {lock_path}") from exc

    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        _reject_symlink_path(lock_path, root, "production status lock")
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def _initialization_result(
    *,
    manifest_path: Path,
    manifest: ProductionStatusManifest,
    created: bool,
    trusted_plan: ProductionPlan,
) -> ProductionStatusInitializationResult:
    _validate_manifest(manifest, trusted_plan=trusted_plan)
    if not isinstance(created, bool):
        raise ProductionStatusError("created must be a boolean")
    result = ProductionStatusInitializationResult(
        manifest_path=manifest_path,
        manifest=manifest,
        created=created,
    )
    if not isinstance(result.manifest_path, Path):
        raise ProductionStatusError("initialization manifest_path must be a Path")
    return result


def _validate_manifest(manifest: ProductionStatusManifest, *, trusted_plan: ProductionPlan) -> None:
    _validate_trusted_plan(trusted_plan)
    if not isinstance(manifest, ProductionStatusManifest):
        raise ProductionStatusError("manifest must be a ProductionStatusManifest")
    if manifest.shoot_slug != trusted_plan.shoot_slug:
        raise ProductionStatusError("Production status shoot slug does not match trusted production plan")
    if manifest.production_plan_fingerprint != production_plan_fingerprint(trusted_plan):
        raise ProductionStatusError(
            "Production status production plan fingerprint does not match trusted production plan"
        )
    if not isinstance(manifest.job_statuses, tuple):
        raise ProductionStatusError("Production status job_statuses must be a tuple")

    jobs_by_id = _trusted_jobs_by_id(trusted_plan)
    expected_job_ids = tuple(jobs_by_id)
    actual_job_ids: list[str] = []
    for status in manifest.job_statuses:
        if not isinstance(status, ProductionJobStatus):
            raise ProductionStatusError("Production status entry must be a ProductionJobStatus")
        actual_job_ids.append(status.job_id)
    if tuple(actual_job_ids) != expected_job_ids:
        raise ProductionStatusError("Production status manifest does not match trusted production jobs")

    statuses_by_id = {status.job_id: status for status in manifest.job_statuses}
    for status in manifest.job_statuses:
        _validate_status(
            status,
            trusted_job=jobs_by_id[status.job_id],
            statuses_by_id=statuses_by_id,
            jobs_by_id=jobs_by_id,
        )


def _validate_trusted_plan(plan: ProductionPlan) -> None:
    if not isinstance(plan, ProductionPlan):
        raise TypeError("trusted_plan must be a ProductionPlan")
    if not isinstance(plan.shoot_slug, str) or not plan.shoot_slug.strip():
        raise ProductionStatusError("Trusted production plan shoot slug cannot be empty")
    _trusted_jobs_by_id(plan)


def _trusted_jobs_by_id(plan: ProductionPlan) -> dict[str, ProductionJob]:
    jobs_by_id: dict[str, ProductionJob] = {}
    for job in plan.jobs:
        if not isinstance(job, ProductionJob):
            raise ProductionStatusError("Trusted production plan job must be a ProductionJob")
        if not isinstance(job.job_id, str) or not job.job_id.strip():
            raise ProductionStatusError("Trusted production job id cannot be empty")
        if job.job_id in jobs_by_id:
            raise ProductionStatusError(f"Duplicate trusted production job id: {job.job_id}")
        _validate_job_artifact_paths(job.outputs, label=f"trusted production outputs: {job.job_id}")
        for dependency_id in job.depends_on:
            if not isinstance(dependency_id, str) or not dependency_id.strip():
                raise ProductionStatusError(f"Trusted production dependency id cannot be empty: {job.job_id}")
        jobs_by_id[job.job_id] = job
    for job in plan.jobs:
        for dependency_id in job.depends_on:
            if dependency_id not in jobs_by_id:
                raise ProductionStatusError(f"Unknown trusted production dependency: {dependency_id}")
    return jobs_by_id


def _validate_status(
    status: ProductionJobStatus,
    *,
    trusted_job: ProductionJob,
    statuses_by_id: dict[str, ProductionJobStatus],
    jobs_by_id: dict[str, ProductionJob],
) -> None:
    if not isinstance(status, ProductionJobStatus):
        raise ProductionStatusError("Production status entry must be a ProductionJobStatus")
    if status.job_id != trusted_job.job_id:
        raise ProductionStatusError("Production status job does not match trusted production job")
    if status.state not in _STATES:
        raise ProductionStatusError(f"Unsupported production status state: {status.state}")
    if isinstance(status.attempts, bool) or not isinstance(status.attempts, int) or status.attempts < 0:
        raise ProductionStatusError(f"Production status attempts must be a non-negative integer: {status.job_id}")
    if status.worker_adapter is not None and not _WORKER_PATTERN.fullmatch(status.worker_adapter):
        raise ProductionStatusError(f"Invalid production status worker adapter: {status.job_id}")
    if status.error_message is not None:
        _validate_error_message(status.error_message, job_id=status.job_id)
    if status.updated_at is not None:
        _validate_timestamp(status.updated_at, job_id=status.job_id)
    if not isinstance(status.output_checksums, tuple):
        raise ProductionStatusError(f"Production status output checksums must be a tuple: {status.job_id}")

    output_paths = _validate_output_checksums(status.output_checksums, trusted_job=trusted_job)
    if status.state == "pending":
        _validate_pending_status(status)
    elif status.state == "running":
        _validate_worker_status_base(status)
        if status.error_message is not None:
            raise ProductionStatusError("Running production status cannot include an error message")
        if status.output_checksums:
            raise ProductionStatusError("Running production status cannot include output checksums")
    elif status.state == "succeeded":
        _validate_worker_status_base(status)
        if status.error_message is not None:
            raise ProductionStatusError("Succeeded production status cannot include an error message")
        if output_paths != trusted_job.outputs:
            raise ProductionStatusError("Succeeded production status must include checksums for every output")
    else:
        _validate_worker_status_base(status)
        if status.error_message is None:
            raise ProductionStatusError(f"{status.state} production status must include an error message")
        if status.output_checksums:
            raise ProductionStatusError(f"{status.state} production status cannot include output checksums")

    _validate_dependencies_succeeded(status, trusted_job=trusted_job, statuses_by_id=statuses_by_id, jobs_by_id=jobs_by_id)


def _validate_pending_status(status: ProductionJobStatus) -> None:
    if status.attempts != 0:
        raise ProductionStatusError("Pending production status attempts must be zero")
    if status.worker_adapter is not None:
        raise ProductionStatusError("Pending production status cannot include a worker adapter")
    if status.error_message is not None:
        raise ProductionStatusError("Pending production status cannot include an error message")
    if status.output_checksums:
        raise ProductionStatusError("Pending production status cannot include output checksums")
    if status.updated_at is not None:
        raise ProductionStatusError("Pending production status cannot include an updated timestamp")


def _validate_worker_status_base(status: ProductionJobStatus) -> None:
    if status.attempts < 1:
        raise ProductionStatusError(f"{status.state} production status attempts must be positive")
    if status.worker_adapter is None:
        raise ProductionStatusError(f"{status.state} production status must include a worker adapter")
    if status.updated_at is None:
        raise ProductionStatusError(f"{status.state} production status must include an updated timestamp")


def _validate_dependencies_succeeded(
    status: ProductionJobStatus,
    *,
    trusted_job: ProductionJob,
    statuses_by_id: dict[str, ProductionJobStatus],
    jobs_by_id: dict[str, ProductionJob],
) -> None:
    if status.state == "pending":
        return
    for dependency_id in trusted_job.depends_on:
        if dependency_id not in jobs_by_id:
            raise ProductionStatusError(f"Unknown production dependency: {dependency_id}")
        dependency_status = statuses_by_id[dependency_id]
        if dependency_status.state != "succeeded":
            raise ProductionStatusError(
                f"Production job dependencies are not succeeded: {status.job_id}"
            )


def _validate_output_checksums(
    checksums: tuple[OutputChecksum, ...],
    *,
    trusted_job: ProductionJob,
) -> tuple[str, ...]:
    trusted_outputs = set(trusted_job.outputs)
    seen_paths: set[str] = set()
    output_paths: list[str] = []
    for checksum in checksums:
        if not isinstance(checksum, OutputChecksum):
            raise ProductionStatusError(f"Production output checksum must be an OutputChecksum: {trusted_job.job_id}")
        _validate_job_artifact_path(checksum.path, label="checksum output path")
        if checksum.path not in trusted_outputs:
            raise ProductionStatusError(f"Unexpected checksum output path: {checksum.path}")
        if checksum.path in seen_paths:
            raise ProductionStatusError(f"Duplicate checksum output path: {checksum.path}")
        if not isinstance(checksum.sha256, str) or not _SHA256_PATTERN.fullmatch(checksum.sha256):
            raise ProductionStatusError(f"Invalid checksum sha256: {checksum.path}")
        seen_paths.add(checksum.path)
        output_paths.append(checksum.path)
    return tuple(output_paths)


def _validate_job_artifact_paths(paths: tuple[str, ...], *, label: str) -> None:
    if not isinstance(paths, tuple):
        raise ProductionStatusError(f"{label} must be a tuple")
    for path in paths:
        _validate_job_artifact_path(path, label=label)


def _validate_job_artifact_path(path: str, *, label: str) -> None:
    if not isinstance(path, str) or not path.strip():
        raise ProductionStatusError(f"{label} cannot be empty")
    artifact_path = Path(path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise ProductionStatusError(f"Unsafe {label}: {path}")


def _validate_error_message(message: str, *, job_id: str) -> None:
    if not isinstance(message, str) or not message.strip():
        raise ProductionStatusError(f"Production status error message cannot be empty: {job_id}")
    if len(message) > 2000 or "\x00" in message:
        raise ProductionStatusError(f"Production status error message is invalid: {job_id}")


def _validate_timestamp(timestamp: str, *, job_id: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise ProductionStatusError(f"Production status timestamp cannot be empty: {job_id}")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise ProductionStatusError(f"Production status timestamp is invalid: {job_id}")


def _production_status_manifest_path(workspace_root: Path | str) -> Path:
    root = Path(workspace_root)
    if root.is_symlink():
        raise ProductionStatusError(f"Refusing production status workspace symlink: {root}")
    return root / PRODUCTION_STATUS_MANIFEST_PATH


def _manifest_json(manifest: ProductionStatusManifest) -> str:
    return json.dumps(_manifest_to_json(manifest), indent=2, sort_keys=True) + "\n"


def _write_manifest_text(manifest_path: Path, *, root: Path, content: str) -> None:
    legacy_temp_path = manifest_path.with_suffix(".json.tmp")
    _reject_symlink_path(legacy_temp_path, root, "temporary production status manifest")
    if legacy_temp_path.exists():
        raise ProductionStatusError(f"Refusing stale temporary production status manifest: {legacy_temp_path}")

    temp_path = manifest_path.with_name(
        f".{manifest_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    try:
        fd = os.open(temp_path, flags, 0o600)
    except OSError as exc:
        raise ProductionStatusError(f"Unable to create temporary production status manifest: {temp_path}") from exc

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
            temp_file.write(content)
        _reject_symlink_path(temp_path, root, "temporary production status manifest")
        temp_path.replace(manifest_path)
    except OSError as exc:
        raise ProductionStatusError(f"Unable to write production status manifest: {manifest_path}") from exc
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass


def _manifest_to_json(manifest: ProductionStatusManifest) -> dict[str, object]:
    return {
        "schema_version": _PRODUCTION_STATUS_SCHEMA_VERSION,
        "shoot_slug": manifest.shoot_slug,
        "production_plan_fingerprint": manifest.production_plan_fingerprint,
        "job_statuses": [_status_to_json(status) for status in manifest.job_statuses],
    }


def _status_to_json(status: ProductionJobStatus) -> dict[str, object]:
    return {
        "job_id": status.job_id,
        "state": status.state,
        "worker_adapter": status.worker_adapter,
        "attempts": status.attempts,
        "error_message": status.error_message,
        "output_checksums": [_checksum_to_json(checksum) for checksum in status.output_checksums],
        "updated_at": status.updated_at,
    }


def _checksum_to_json(checksum: OutputChecksum) -> dict[str, str]:
    return {
        "path": checksum.path,
        "sha256": checksum.sha256,
    }


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ProductionStatusError(f"Missing production status manifest: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ProductionStatusError(f"Invalid production status manifest JSON: {path}") from exc
    if not isinstance(raw, dict):
        raise ProductionStatusError(f"Production status manifest root must be an object: {path}")
    return raw


def _manifest_from_json(raw_manifest: dict[str, object]) -> ProductionStatusManifest:
    _validate_exact_keys(raw_manifest, allowed_keys=_MANIFEST_KEYS, label="manifest")
    if raw_manifest.get("schema_version") != _PRODUCTION_STATUS_SCHEMA_VERSION:
        raise ProductionStatusError("Unsupported production status manifest schema version")
    raw_statuses = raw_manifest.get("job_statuses")
    if not isinstance(raw_statuses, list):
        raise ProductionStatusError("Production status manifest must contain a job_statuses list")
    return ProductionStatusManifest(
        shoot_slug=_required_manifest_string(raw_manifest, "shoot_slug"),
        production_plan_fingerprint=_required_plan_fingerprint(raw_manifest),
        job_statuses=tuple(_status_from_json(raw_status) for raw_status in raw_statuses),
    )


def _trusted_job_fingerprint_input(job: ProductionJob) -> dict[str, object]:
    return {
        "job_id": job.job_id,
        "output_kind": job.output_kind,
        "inputs": list(job.inputs),
        "outputs": list(job.outputs),
        "depends_on": list(job.depends_on),
        "can_run_in_parallel": job.can_run_in_parallel,
        "spec": None if job.spec is None else job.spec.name,
    }


def _status_from_json(raw_status: object) -> ProductionJobStatus:
    if not isinstance(raw_status, dict):
        raise ProductionStatusError("Production status entry must be an object")
    _validate_exact_keys(raw_status, allowed_keys=_STATUS_KEYS, label="field")
    return ProductionJobStatus(
        job_id=_required_status_string(raw_status, "job_id"),
        state=_required_state(raw_status),
        worker_adapter=_optional_status_string(raw_status, "worker_adapter"),
        attempts=_required_status_int(raw_status, "attempts"),
        error_message=_optional_status_string(raw_status, "error_message"),
        output_checksums=_required_output_checksums(raw_status),
        updated_at=_optional_status_string(raw_status, "updated_at"),
    )


def _required_output_checksums(raw_status: dict[object, object]) -> tuple[OutputChecksum, ...]:
    value = raw_status.get("output_checksums")
    if not isinstance(value, list):
        raise ProductionStatusError("Production status output_checksums must be a list")
    checksums: list[OutputChecksum] = []
    for raw_checksum in value:
        if not isinstance(raw_checksum, dict):
            raise ProductionStatusError("Production output checksum must be an object")
        _validate_exact_keys(raw_checksum, allowed_keys=_CHECKSUM_KEYS, label="checksum")
        checksums.append(
            OutputChecksum(
                path=_required_status_string(raw_checksum, "path"),
                sha256=_required_status_string(raw_checksum, "sha256"),
            )
        )
    return tuple(checksums)


def _required_manifest_string(raw_manifest: dict[object, object], key: str) -> str:
    value = raw_manifest.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ProductionStatusError(f"Production status manifest field must be a non-empty string: {key}")
    return value


def _required_plan_fingerprint(raw_manifest: dict[object, object]) -> str:
    fingerprint = _required_manifest_string(raw_manifest, "production_plan_fingerprint")
    if not _SHA256_PATTERN.fullmatch(fingerprint):
        raise ProductionStatusError("Production status production plan fingerprint must be a SHA-256 hex digest")
    return fingerprint


def _required_status_string(raw_status: dict[object, object], key: str) -> str:
    value = raw_status.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ProductionStatusError(f"Production status field must be a non-empty string: {key}")
    return value


def _optional_status_string(raw_status: dict[object, object], key: str) -> str | None:
    value = raw_status.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ProductionStatusError(f"Production status field must be null or a non-empty string: {key}")
    return value


def _required_state(raw_status: dict[object, object]) -> ProductionJobState:
    value = _required_status_string(raw_status, "state")
    if value not in _STATES:
        raise ProductionStatusError(f"Unsupported production status state: {value}")
    return value  # type: ignore[return-value]


def _required_status_int(raw_status: dict[object, object], key: str) -> int:
    value = raw_status.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ProductionStatusError(f"Production status field must be an integer: {key}")
    return value


def _validate_exact_keys(
    raw_object: dict[object, object],
    *,
    allowed_keys: frozenset[str],
    label: str,
) -> None:
    actual_keys = set(raw_object)
    unexpected_keys = sorted(str(key) for key in actual_keys - allowed_keys)
    if unexpected_keys:
        raise ProductionStatusError(f"Unexpected production status {label}: {', '.join(unexpected_keys)}")
    missing_keys = sorted(allowed_keys - actual_keys)
    if missing_keys:
        raise ProductionStatusError(f"Missing production status {label}: {', '.join(missing_keys)}")


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise ProductionStatusError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent
