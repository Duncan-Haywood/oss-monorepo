# Photos Import Tools

Resumable macOS photo-import utilities for safely moving JPEG and RAW media
into Apple Photos. The tools provide manifest-backed progress, duplicate-risk
handling, structured error classification, watchdog supervision, and SD-card
offload support.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/photos-import-tools/

## Included tools

- `resumable_photos_import.py` — stateful, restartable Photos importer
- `photos_import_watchdog.py` — supervises JPEG and RAW import phases
- `photos_import_errors.py` — classifies failures and selects recovery actions
- `verify` command — reads every manifest file back and identifies missing,
  empty, or unreadable media before a library or staging directory is retired
- `sd_offload.py` — copies media from removable storage; `--verify hash`
  compares source/dest SHA-256 (default `size` compares byte counts only)
- `atomic_io.py` — atomic JSON writer shared by the importer, watchdog, and
  offload; the observability records (`status.json`, `completion_report.json`,
  offload manifest/summary) land via a temp file and `os.replace`, so a reader
  polling during a rewrite or a crash mid-write never sees a torn document
- `start_import.sh` — local entrypoint

## Usage

All paths below default to a specific machine's layout (`--root`,
`--state-dir`, `--tool-dir`, `--staging-root`); pass your own or export the
env vars shown in "Unattended watchdog" below. JPEG and RAW each keep a
separate manifest (`--media-type jpeg|raw`, default `jpeg`), so a RAW import
needs its own `init`/`run` pass.

### Importing a folder into Apple Photos

```bash
# One-time: build the manifest from files already on disk.
.venv/bin/python resumable_photos_import.py init \
  --root "/path/to/Photos_Organized/2026" \
  --state-dir "/path/to/Photos_Organized/.import_state"

# Import in batches until nothing pending remains (safe to re-run after a
# crash, Ctrl-C, or a Photos.app timeout -- the manifest resumes where it
# left off).
.venv/bin/python resumable_photos_import.py run \
  --root "/path/to/Photos_Organized/2026" \
  --state-dir "/path/to/Photos_Organized/.import_state"

# Check progress and recent errors at any time.
.venv/bin/python resumable_photos_import.py status \
  --state-dir "/path/to/Photos_Organized/.import_state"

# Import RAW files from the same tree (separate manifest).
.venv/bin/python resumable_photos_import.py run --media-type raw \
  --root "/path/to/Photos_Organized/2026" \
  --state-dir "/path/to/Photos_Organized/.import_state"
```

Other `command`s: `preflight` marks files already present in Photos.app
(by matching `--photos-db`) as imported without re-importing them;
`skip-uncertain` clears files left `uncertain` by a prior Photos.app timeout,
since a timeout may have imported them without confirming. Useful flags:
`--batch-size` (default 10), `--timeout` seconds per file (default 180),
`--attempts` retries for transient failures (default 3), `--photos-preflight`
to check each file against Photos.app before importing it.

After an import or before removing a source/staging copy, verify that the files
tracked by a manifest are still present and readable. It exits with status 1 if
any file is missing, empty, or unreadable:

```bash
.venv/bin/python resumable_photos_import.py verify \
  --state-dir "/path/to/Photos_Organized/.import_state" \
  --media-type jpeg --json
```

The audit reads files locally and appends only aggregate counts to the local
`events_<media-type>.jsonl` usage log; it sends no telemetry or file contents.

### Unattended watchdog

Supervises `run` across JPEG and, optionally, RAW phases, restarting the
importer if it stalls or exits, and refusing to report "complete" until every
phase it was asked to run has actually finished:

```bash
.venv/bin/python photos_import_watchdog.py \
  --root "/path/to/Photos_Organized/2026" \
  --state-dir "/path/to/Photos_Organized/.import_state" \
  --tool-dir "/path/to/photos_import_tools" \
  --include-raws
```

`start_import.sh` wraps this for a `caffeinate`d background run (keeps the
Mac awake, appends to `$STATE_DIR/watchdog.log`) and reads its settings from
environment variables instead of flags:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ROOT_DIR` | `~/…/Photos_Organized/2026` | Source tree to import |
| `STATE_DIR` | `~/…/Photos_Organized/.import_state` | Manifest/status/log directory |
| `BATCH_SIZE` | `10` | JPEG batch size per import pass |
| `INCLUDE_RAWS` | `1` | Also run the RAW phase (`0` to skip it) |
| `RAW_BATCH_SIZE` | `3` | RAW batch size per import pass |
| `RAW_TIMEOUT` | `600` | Per-file timeout (seconds) during the RAW phase |

```bash
STATE_DIR=/path/to/.import_state ROOT_DIR=/path/to/2026 INCLUDE_RAWS=0 \
  ./start_import.sh
```

Stop a running watchdog cleanly with `touch "$STATE_DIR/STOP"`, Ctrl-C, or
`kill <pid>` — it terminates the current worker's process group before
exiting rather than leaving it as an orphan.

### Offloading SD cards

Copies media from mounted SD cards to a staging directory, verifying each
file after copy (`--verify size` compares byte counts, the default;
`--verify hash` also compares SHA-256, catching same-size corruption that a
size check would miss). Exits non-zero if any card fails or nothing was
offloaded, so a wrapper cannot mistake a failed run for "safe to eject":

```bash
.venv/bin/python sd_offload.py --card all --verify hash \
  --staging-root "/path/to/SD_Import_2026-06-14"
```

`--card` restricts the run to one card (`insta360` or `sony`; both are
hardcoded to specific `/Volumes/…` mount points and `include_paths` in
`sd_offload.py` — edit `CardSpec` entries there to match your own card
names). Output lands in `<staging-root>/_logs/` and
`<staging-root>/OFFLOAD_SUMMARY.json`.

## Development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests
```

Generated EXIF/GPS caches, SQLite state, logs, bytecode, and the virtual
environment are intentionally excluded. They are machine-specific and may
contain information derived from private photos.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a substitute for your own backups.
**You are responsible for verifying that a copy completed successfully and
for keeping an independent backup of anything irreplaceable** — photo
libraries included — before running an import or offload. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use. See [`LICENSE`](LICENSE) for the full terms.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what these tools do.

## Privacy

Everything here runs locally on your own machine. These tools make no network
calls, send no data anywhere, and have no analytics vendor or telemetry of any
kind. The only records produced (`status.json`, `completion_report.json`,
offload manifests) are written to disk on the machine running the tool, for
your own use — see "Development" above for why they, and other
machine-specific caches, are excluded from version control.
