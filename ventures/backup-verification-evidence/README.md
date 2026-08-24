# Backup Verification Evidence

A free, local CLI that answers the question a backup exit code alone cannot:
**did last night's backup actually produce a usable artifact, or did it just
exit cleanly?**

Scheduled backups (`restic`, `borg`, `pg_dump`, `rsync`, `tar`, cron/systemd
jobs of any kind) fail silently more often than they fail loudly: the disk
fills up, the destination is unreachable, or a script writes a truncated file
and still exits `0`. This tool never runs your backup for you and never
certifies that your data is safe. It observes one thing: whether the exit
code and the resulting artifact (existence, size, freshness) actually agree
with what you expect, and reports the answer as one of four states —
`verified`, `suspicious`, `failed`, or `inconclusive` — never silently folding
an ambiguous or bad run into "looks fine."

## Run

```bash
python3 -m unittest discover -s tests -v

# Wrap a real backup command and record what actually happened:
PYTHONPATH=src python3 -m backup_evidence.cli record \
  --tool restic --artifact /backups/restic-repo \
  --min-size-bytes 1000000 --max-age-hours 26 \
  --output runs/2026-08-24.json -- restic backup /data

# Check one or more recorded runs:
PYTHONPATH=src python3 -m backup_evidence.cli check \
  runs/*.json --format markdown
```

`check` exits `0` when the most recent run is `verified`, and non-zero
otherwise — wire it into your own monitoring/alerting as the pass/fail signal
without depending on this tool for the alerting itself. See
`examples/run-verified.json`, `examples/run-suspicious.json`, and
`examples/run-failed.json` for the run-record format and what triggers each
state.

The `--usage-file` flag on either subcommand appends one local, anonymized
event-count file — see "Privacy" below.

## What this is not

- **Not a backup tool.** It does not back anything up, upload anything, or
  touch your data beyond `stat`-ing the artifact path you give it.
- **Not a restore guarantee.** A `verified` result means the job exited 0 and
  produced an artifact meeting the size/age expectations you gave it — not
  that the archive is uncorrupted or restorable. Test restores separately.
- **Not a monitoring service.** There is no scheduler, no hosted component,
  and no notification delivery in this slice; `record`/`check` are meant to
  be wired into your own cron/systemd/CI job.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a substitute for testing your own
restores or for an independent backup strategy. **You are responsible for
verifying that your backups are actually restorable** — this tool only
reports what an exit code and a file stat show. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use, including reliance on a `verified` result. See
[`LICENSE`](LICENSE) for the full terms.

## Privacy

Everything here runs locally. `record` and `check` make no network calls and
send no data anywhere. The optional `--usage-file` writes one local JSON file
with event names and counts only — never backup tool names, file paths,
sizes, timestamps, or log content. Omit the flag and nothing is written.
