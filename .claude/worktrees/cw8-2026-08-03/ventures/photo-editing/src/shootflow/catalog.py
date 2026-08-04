from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.deliverables import MediaAsset
from shootflow.ingest import sha256_file

CatalogMediaType = Literal["photo", "video"]

_PHOTO_EXTENSIONS = {
    ".arw",
    ".cr2",
    ".cr3",
    ".dng",
    ".heic",
    ".jpeg",
    ".jpg",
    ".nef",
    ".orf",
    ".raf",
    ".rw2",
    ".tif",
    ".tiff",
}
_VIDEO_EXTENSIONS = {
    ".3gp",
    ".ari",
    ".avi",
    ".braw",
    ".m4v",
    ".mov",
    ".mp4",
    ".mts",
    ".r3d",
    ".xavc",
}


class CatalogError(ValueError):
    """Raised when an ingest manifest cannot safely become a media catalog."""


@dataclass(frozen=True)
class CatalogAsset:
    original_path: Path
    relative_path: Path
    checksum_sha256: str
    size_bytes: int
    media_type: CatalogMediaType


@dataclass(frozen=True)
class ShootCatalog:
    manifest_path: Path
    shoot_date: str
    shoot_slug: str
    source_root: Path
    destination_root: Path
    source_deleted: bool
    assets: tuple[CatalogAsset, ...]


def load_ingest_manifest(manifest_path: Path | str) -> ShootCatalog:
    manifest = Path(manifest_path)
    if manifest.is_symlink():
        raise CatalogError(f"Refusing manifest symlink: {manifest}")
    if not manifest.is_file():
        raise FileNotFoundError(manifest)

    try:
        raw_data = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CatalogError(f"Invalid ingest manifest JSON: {manifest}") from exc
    if not isinstance(raw_data, dict):
        raise CatalogError("Manifest root must be an object")

    shoot_date = _required_string(raw_data, "shoot_date")
    shoot_slug = _required_string(raw_data, "shoot_slug")
    source_root = Path(_required_string(raw_data, "source_root"))
    destination_root = Path(_required_string(raw_data, "destination_root"))
    source_deleted = _required_bool(raw_data, "source_deleted")
    _validate_manifest_location(
        manifest=manifest,
        destination_root=destination_root,
        shoot_date=shoot_date,
        shoot_slug=shoot_slug,
    )
    if source_deleted:
        raise CatalogError("Refusing manifest that claims source media was deleted")
    raw_items = raw_data.get("items")
    if not isinstance(raw_items, list):
        raise CatalogError("Manifest items must be a list")

    assets: list[CatalogAsset] = []
    for raw_item in raw_items:
        asset = _catalog_asset_from_manifest_item(raw_item, destination_root)
        if asset is not None:
            assets.append(asset)

    return ShootCatalog(
        manifest_path=manifest,
        shoot_date=shoot_date,
        shoot_slug=shoot_slug,
        source_root=source_root,
        destination_root=destination_root,
        source_deleted=source_deleted,
        assets=tuple(assets),
    )


def production_assets_from_manifest(catalog: ShootCatalog) -> list[MediaAsset]:
    if not isinstance(catalog, ShootCatalog):
        raise TypeError("catalog must be a ShootCatalog")
    return [
        MediaAsset(path=str(asset.original_path), media_type=asset.media_type)
        for asset in catalog.assets
    ]


def _catalog_asset_from_manifest_item(
    raw_item: object,
    destination_root: Path,
) -> CatalogAsset | None:
    if not isinstance(raw_item, dict):
        raise CatalogError("Manifest item must be an object")

    destination = Path(_required_string(raw_item, "destination"))
    _ensure_relative_to(destination, destination_root)
    _reject_symlink(destination, "catalog destination")

    media_type = _infer_media_type(destination)
    if media_type is None:
        return None

    relative_path = Path(_required_string(raw_item, "relative_path"))
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise CatalogError(f"Unsafe relative path in manifest: {relative_path}")

    checksum = _required_string(raw_item, "checksum_sha256")
    if len(checksum) != 64 or any(char not in "0123456789abcdef" for char in checksum.lower()):
        raise CatalogError(f"Invalid SHA-256 checksum for: {destination}")

    size_bytes = _required_int(raw_item, "size_bytes")
    if size_bytes < 0:
        raise CatalogError(f"Invalid size for: {destination}")
    if not destination.is_file():
        raise CatalogError(f"Manifest destination file is missing: {destination}")
    if destination.stat().st_size != size_bytes:
        raise CatalogError(f"Manifest size does not match destination file: {destination}")
    if sha256_file(destination) != checksum.lower():
        raise CatalogError(f"Manifest checksum does not match destination file: {destination}")

    return CatalogAsset(
        original_path=destination,
        relative_path=relative_path,
        checksum_sha256=checksum.lower(),
        size_bytes=size_bytes,
        media_type=media_type,
    )


def _infer_media_type(path: Path) -> CatalogMediaType | None:
    suffix = path.suffix.lower()
    if suffix in _PHOTO_EXTENSIONS:
        return "photo"
    if suffix in _VIDEO_EXTENSIONS:
        return "video"
    return None


def _required_string(data: dict[object, object], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value:
        raise CatalogError(f"Manifest field must be a non-empty string: {key}")
    return value


def _required_bool(data: dict[object, object], key: str) -> bool:
    value = data.get(key)
    if not isinstance(value, bool):
        raise CatalogError(f"Manifest field must be a boolean: {key}")
    return value


def _required_int(data: dict[object, object], key: str) -> int:
    value = data.get(key)
    if type(value) is not int:
        raise CatalogError(f"Manifest field must be an integer: {key}")
    return value


def _validate_manifest_location(
    *,
    manifest: Path,
    destination_root: Path,
    shoot_date: str,
    shoot_slug: str,
) -> None:
    expected_shoot_folder = f"{shoot_date}_{shoot_slug}"
    if manifest.name != "ingest_manifest.json" or manifest.parent.name != expected_shoot_folder:
        raise CatalogError(f"Manifest is not in the expected shoot folder: {manifest}")
    if manifest.parent.parent.resolve() != destination_root.resolve():
        raise CatalogError("Manifest destination root does not match its library location")


def _ensure_relative_to(path: Path, root: Path) -> None:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise CatalogError(f"Path escapes destination root: {path}") from exc


def _reject_symlink(path: Path, label: str) -> None:
    if path.is_symlink():
        raise CatalogError(f"Refusing {label} symlink: {path}")
