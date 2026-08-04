# Photos Import Tools

Resumable macOS photo-import utilities for safely moving JPEG and RAW media
into Apple Photos. The tools provide manifest-backed progress, duplicate-risk
handling, structured error classification, watchdog supervision, and SD-card
offload support.

## Included tools

- `resumable_photos_import.py` — stateful, restartable Photos importer
- `photos_import_watchdog.py` — supervises JPEG and RAW import phases
- `photos_import_errors.py` — classifies failures and selects recovery actions
- `sd_offload.py` — copies media from removable storage
- `start_import.sh` — local entrypoint

## What "verified" means in an offload manifest

`sd_offload.py` writes a manifest whose entries a person is expected to read
before erasing a camera card, so each status is defined narrowly:

- `verified` — SHA-256 was read off both the card and the copy and the two
  matched. Only these entries carry `source_sha256`/`dest_sha256`, and only
  these files are evicted from local storage.
- `checksum_mismatch` — same byte count, different content. The copy is bad.
- `size_mismatch` — byte counts differ; settled without hashing either side.
- `missing` — no copy exists at the destination.
- `unreadable` — a side could not be read to complete the comparison.

Anything other than `verified` means that file has not been proven intact and
the card still holds the only good copy.

## Development

The venture's verification contract is `pytest tests` (see `VENTURE.yaml`),
which is also what CI runs. `unittest discover` collects only a subset of this
suite and must not be used to judge it.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests
```

Generated EXIF/GPS caches, SQLite state, logs, bytecode, and the virtual
environment are intentionally excluded. They are machine-specific and may
contain information derived from private photos.
