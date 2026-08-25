# Backup Verification Evidence

A free, local CLI that answers the question a backup exit code alone cannot:
**did last night's backup actually produce a usable artifact, or did it just
exit cleanly?**

Scheduled backups (`restic`, `borg`, `pg_dump`, `rsync`, `tar`, cron/systemd
jobs of any kind) fail silently more often than they fail loudly: the disk
fills up, the destination is unreachable, or a script writes a truncated file
and still exits `0`. This tool never runs your backup for you and never
certifies that your data is safe. It observes two things — whether the exit
code and the artifact stat agree with what you expect, and, if you ask it to,
whether the artifact actually **reads back**  — and reports the answer as one of
four states: `verified`, `suspicious`, `failed`, or `inconclusive`, never
silently folding an ambiguous or bad run into "looks fine."

## Start here: is this archive readable?

The fastest useful thing, needing no setup and no changes to your cron jobs —
point it at backups you already have:

```bash
PYTHONPATH=src python3 -m backup_evidence.cli verify /backups/*.tar.gz

# Also require each artifact to have been modified within the last 26 hours:
PYTHONPATH=src python3 -m backup_evidence.cli verify \
  --max-age-hours 26 /backups/*.tar.gz
```

```
INTACT  /backups/2026-08-23.tar.gz  [tar.gz]
    walked all 812 member(s) to the end-of-archive marker and read 4182034 bytes of member data without error
CORRUPT  /backups/2026-08-24.tar.gz  [tar.gz]
    the tar stream ended or failed mid-archive after 604 member(s) (unexpected end of data). A complete
    tar ends with its end-of-archive marker; this one does not, so the writer did not finish.
```

`verify` opens each artifact and reads it end to end. Exit codes are three-way
on purpose, so an alerting rule can treat "broken" and "couldn't tell"
differently: `0` every artifact intact, `1` at least one **provably corrupt**,
`2` none corrupt but at least one could not be checked. `--format json` gives
the same findings machine-readably. With `--max-age-hours`, a structurally
intact but old artifact is reported as `stale` and exits `2`; a corrupt artifact
still exits `1`.

### Why reading the file matters

Exit code, size, and mtime share one blind spot: an archive that is **big,
fresh, and broken**. That is not a rare case, it is the standard one:

- `pg_dump … | gzip > out.sql.gz` with no `set -o pipefail`. The shell reports
  *gzip's* exit code, so `pg_dump` dying halfway is invisible. Fresh file,
  large file, truncated dump.
- The destination filled up mid-write. Whatever fit is on disk.
- A network destination dropped and the copy stopped short.

Every one of those passes a size floor and a freshness window. Decompressing
the artifact is what separates them from a good run, because compression
formats carry checksums and archive formats carry end-of-archive markers —
reading one to completion is a real test that the writer finished.

| Artifact | What gets checked |
|---|---|
| `.tar`, `.tar.gz`, `.tar.bz2`, `.tar.xz` | every member walked to the end-of-archive marker, member data read (catches a short tar inside a *valid* gzip) |
| `.gz`, `.bz2`, `.xz` | decompressed to end of stream; the format's own checksum must match |
| `.zip` | every member's stored CRC re-checked |
| SQLite `.db` / `.sqlite` | SQLite's own `PRAGMA quick_check`, opened strictly read-only |
| `pg_dump`/`mysqldump` plain text, **including inside `.gz`/`.bz2`/`.xz`** | the dump-complete trailer a finished dump ends with |
| restic/borg directories, zstd, `pg_dump -Fc` | reported `unsupported`, never guessed — with the native command to run instead |

A clean wrapper is never mistaken for a clean payload. `pg_dump … \| gzip` writes
a **CRC-valid gzip around a truncated dump**, so the compressed dump is unwrapped
and its trailer checked too — otherwise the headline case above would slip
through. Where a compressed payload is a container that genuinely cannot be
checked from a stream (a SQLite database, a `pg_dump -Fc` file), the result is
`unsupported` and says the wrapper verified but the payload did not, rather than
`intact`.

Formats are detected from magic bytes, not extensions, because backup
filenames lie routinely.

## Wire it into a scheduled job

```bash
python3 -m unittest discover -s tests -v

# Wrap a real backup command and record what actually happened:
PYTHONPATH=src python3 -m backup_evidence.cli record \
  --tool restic --artifact /backups/restic-repo \
  --min-size-bytes 1000000 --max-age-hours 26 \
  --output runs/2026-08-24.json -- restic backup /data

# Same, but also read the artifact back before believing the exit code:
PYTHONPATH=src python3 -m backup_evidence.cli record \
  --tool 'pg_dump|gzip' --artifact /backups/db.sql.gz \
  --min-size-bytes 1000000 --max-age-hours 26 --verify-integrity \
  --output runs/2026-08-24.json -- /usr/local/bin/nightly-dump.sh

# Check one or more recorded runs:
PYTHONPATH=src python3 -m backup_evidence.cli check \
  runs/*.json --format markdown
```

`--verify-integrity` is opt-in: it reads the whole artifact, which costs I/O
proportional to your backup size, so an existing job keeps its old cost until
you ask for it. `--integrity-max-bytes N` caps that read — a run that stops at
the cap is reported `inconclusive`, never `verified`, because the tail is
exactly where truncation lives.

A run whose artifact is **provably corrupt** is reported `failed` even though
the command exited `0`. There is nothing ambiguous about a checksum that did
not match, so it is not softened to `suspicious`. When no integrity check ran,
`verified` says so in its own reason text — the two grades of `verified` are
different claims and the report never blurs them.

`check` exits `0` when the most recent run is `verified`, and non-zero
otherwise — wire it into your own monitoring/alerting as the pass/fail signal
without depending on this tool for the alerting itself. See
`examples/run-verified.json`, `examples/run-suspicious.json`,
`examples/run-failed.json`, and `examples/run-corrupt-artifact.json` for the
run-record format and what triggers each state.

The `--usage-file` flag on any subcommand appends one local, anonymized
event-count file — see "Privacy" below.

## What this is not

- **Not a backup tool.** It does not back anything up, upload anything, or
  modify your data. Integrity checks open artifacts strictly for reading and
  stream them in chunks; nothing is extracted to disk, and the SQLite check
  opens the database read-only so it cannot journal, recover, or otherwise
  alter the file it was pointed at.
- **Not a restore guarantee.** This is the important one. `intact` means the
  artifact decompressed and/or parsed to its end and every checksum the format
  carries matched — real evidence that the writer finished. It does **not**
  mean the backup contains the right data, or that a restore will succeed. An
  intact archive of the wrong database is still intact; so is a perfect backup
  of a table someone dropped last week. Test restores separately.
- **Not a substitute for the native checker.** `restic check`, `borg check`,
  `pg_restore --list`, and `zstd -t` know things this cannot. Where a format
  is out of reach it is reported `unsupported` and names the command to run
  instead, rather than being quietly passed.
- **Not a monitoring service.** There is no scheduler, no hosted component,
  and no notification delivery in this slice; `verify`/`record`/`check` are
  meant to be wired into your own cron/systemd/CI job.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a substitute for testing your own
restores or for an independent backup strategy. **You are responsible for
verifying that your backups are actually restorable** — this tool reports what
an exit code, a file stat, and (when asked) a structural read of the artifact
show, which is strictly less than a successful restore. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use, including reliance on a `verified` or `intact` result.
See [`LICENSE`](LICENSE) for the full terms.

## Privacy

Everything here runs locally. `verify`, `record`, and `check` make no network
calls and send no data anywhere. Integrity checks read artifact bytes into
memory in chunks and discard them; nothing is written, copied, or retained,
and archive member names are never used for a filesystem operation. The
optional `--usage-file` writes one local JSON file with event names and counts
only (`run_recorded`, `artifact_verified`, `report_generated`) — never backup
tool names, file paths, sizes, timestamps, archive contents, or log content.
Omit the flag and nothing is written.
