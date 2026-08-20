# Photos Import Tools

Resumable macOS photo-import utilities for safely moving JPEG and RAW media
into Apple Photos. The tools provide manifest-backed progress, duplicate-risk
handling, structured error classification, watchdog supervision, and SD-card
offload support.

## Included tools

- `resumable_photos_import.py` — stateful, restartable Photos importer
- `photos_import_watchdog.py` — supervises JPEG and RAW import phases
- `photos_import_errors.py` — classifies failures and selects recovery actions
- `sd_offload.py` — copies media from removable storage; `--verify hash`
  compares source/dest SHA-256 (default `size` compares byte counts only)
- `atomic_io.py` — atomic JSON writer shared by the importer, watchdog, and
  offload; the observability records (`status.json`, `completion_report.json`,
  offload manifest/summary) land via a temp file and `os.replace`, so a reader
  polling during a rewrite or a crash mid-write never sees a torn document
- `start_import.sh` — local entrypoint

## Development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests
```

Generated EXIF/GPS caches, SQLite state, logs, bytecode, and the virtual
environment are intentionally excluded. They are machine-specific and may
contain information derived from private photos.
