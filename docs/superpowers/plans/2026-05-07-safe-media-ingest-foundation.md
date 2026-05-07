# Safe Media Ingest Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested, copy-only ingest foundation for organizing large photo and video shoots without risking source media.

**Architecture:** Implement a small Python package with focused modules for media classification, ingest planning, safe copy execution, and manifest writing. Keep the API deterministic so future Swift, Mac, iPhone, and distributed worker implementations can mirror the same manifest contract.

**Tech Stack:** Python 3.12 standard library, `unittest`, JSON manifests, SHA-256 checksums.

---

## File structure

- `media_tool/__init__.py`: public package exports.
- `media_tool/media_types.py`: media extension sets and classification helpers.
- `media_tool/ingest.py`: scan, plan, copy, checksum, and manifest behavior.
- `media_tool/cli.py`: minimal command-line entry point for dry-run and execution.
- `tests/test_media_types.py`: classification coverage.
- `tests/test_ingest.py`: planning, collision, copy, and manifest coverage.
- `README.md`: product overview and quick-start usage.
- `docs/product/media-automation-product-strategy.md`: business viability and roadmap notes.
- `docs/legal/terms-and-conditions.md`: draft terms with indemnification and data-loss safety language.

## Task 1: Classification

**Files:**
- Create: `media_tool/media_types.py`
- Create: `tests/test_media_types.py`

- [ ] **Step 1: Write failing classification tests**

```python
import unittest

from media_tool.media_types import MediaKind, classify_extension, is_supported_media


class MediaTypeTests(unittest.TestCase):
    def test_classifies_common_camera_formats_case_insensitively(self):
        self.assertEqual(classify_extension("CR3"), MediaKind.RAW_PHOTO)
        self.assertEqual(classify_extension(".jpg"), MediaKind.PHOTO)
        self.assertEqual(classify_extension("mov"), MediaKind.VIDEO)
        self.assertEqual(classify_extension(".wav"), MediaKind.AUDIO)
        self.assertEqual(classify_extension(".xmp"), MediaKind.SIDECAR)

    def test_identifies_unsupported_files(self):
        self.assertIsNone(classify_extension(".txt"))
        self.assertFalse(is_supported_media("notes.txt"))
        self.assertTrue(is_supported_media("clip.MP4"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_media_types`

Expected: FAIL because `media_tool.media_types` does not exist.

- [ ] **Step 3: Implement classification**

Create `MediaKind`, extension sets, `classify_extension`, and `is_supported_media`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_media_types`

Expected: PASS.

## Task 2: Ingest planning

**Files:**
- Create: `media_tool/ingest.py`
- Create: `tests/test_ingest.py`

- [ ] **Step 1: Write failing planning tests**

Tests should create a temporary source tree with RAW, JPEG, video, sidecar, hidden, and unsupported files. Assert that `build_ingest_plan` includes supported files only and maps them under `<destination>/<shoot_slug>/originals/<kind>/<relative_path>`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_ingest`

Expected: FAIL because `media_tool.ingest` does not exist.

- [ ] **Step 3: Implement scan and planning**

Create dataclasses for `MediaAsset`, `PlannedCopy`, and `IngestPlan`; recursively scan source folders; produce deterministic destinations; skip hidden/system files.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_ingest`

Expected: PASS.

## Task 3: Safe copy and manifest

**Files:**
- Modify: `media_tool/ingest.py`
- Modify: `tests/test_ingest.py`

- [ ] **Step 1: Write failing execution tests**

Tests should execute a plan against temporary files, assert copied bytes match originals, assert SHA-256 appears in results, assert manifest JSON is written, and assert existing conflicting destinations are not overwritten.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_ingest`

Expected: FAIL because execution helpers are missing.

- [ ] **Step 3: Implement safe copy**

Use a destination-local temporary file, `shutil.copy2`, SHA-256 verification, no-overwrite finalization from temp to destination, and unique JSON manifest writing.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_ingest`

Expected: PASS.

## Task 4: CLI and docs

**Files:**
- Create: `media_tool/cli.py`
- Modify: `media_tool/__init__.py`
- Modify: `README.md`
- Create: `docs/product/media-automation-product-strategy.md`
- Create: `docs/legal/terms-and-conditions.md`

- [ ] **Step 1: Add CLI smoke coverage manually**

Use temporary source/destination folders and run `python3 -m media_tool.cli --source <source> --library <dest> --shoot demo --dry-run`.

- [ ] **Step 2: Implement CLI**

Parse `--source`, `--library`, `--shoot`, and `--dry-run`; print summary counts; execute copies only when `--dry-run` is absent.

- [ ] **Step 3: Update docs**

Document product intent, safety posture, architecture direction, CLI usage, and legal/indemnification caveats.

- [ ] **Step 4: Run full verification**

Run:

```bash
python3 -m unittest discover
python3 -m media_tool.cli --help
```

Expected: tests pass and CLI help prints usage.

## Self-review

- Spec coverage: this plan covers the safe ingest scope from the foundation design.
- Placeholder scan: no implementation task relies on unspecified behavior.
- Type consistency: `MediaKind`, `MediaAsset`, `PlannedCopy`, and `IngestPlan` names are consistent across tasks.
