# Ops scripts

Production operations helpers for Grant Autopilot. The playbooks that use them are in
[`docs/RUNBOOK.md`](../../docs/RUNBOOK.md). Both scripts are plain Node 22 ESM with no dependencies
beyond the repo's wrangler, and both read resource names from `scripts/provision.mjs` (`--env demo`
switches every name to the demo deployment).

Run them from `apps/grants`:

```sh
export CLOUDFLARE_API_TOKEN=...      # see "Tokens" below
export CLOUDFLARE_ACCOUNT_ID=...
```

## `dlq-replay.mjs`: inspect and replay the dead-letter queue

Pulls messages from `grant-autopilot-jobs-dlq` with the Queues HTTP pull API, summarizes them by job
`type`, and with `--replay` pushes them back to `grant-autopilot-jobs` and acks them in the DLQ.

```sh
node scripts/ops/dlq-replay.mjs                                    # summary by type; changes nothing
node scripts/ops/dlq-replay.mjs --list                             # + one line per message
node scripts/ops/dlq-replay.mjs --replay --dry-run                 # what a replay would send
node scripts/ops/dlq-replay.mjs --replay --type document.process --limit 50
node scripts/ops/dlq-replay.mjs --replay --delay-seconds 120       # deliver the replays 2 min later
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--replay` | off | re-send the selected messages to the main queue, then ack them in the DLQ |
| `--dry-run` | off | with `--replay`: report only, send and ack nothing |
| `--type <jobType>` | all known types | select one job type (also the only way to replay an unknown type) |
| `--limit <n>` | 100 | pull at most n messages (max 5000) |
| `--list` | off | print message id, type, attempts, age and the body's `*Id` fields |
| `--env production\|demo` | production | which deployment's queues |
| `--dlq`, `--queue` | from `--env` | override the queue names |
| `--delay-seconds <n>` | 0 | delay delivery of replayed messages |
| `--visibility-timeout-secs <n>` | 600 | how long pulled messages stay leased while the script runs |

How it behaves:
- **Output never includes message bodies.** It prints only the job type, the queue message id,
  attempts, age, and body fields named `*Id` (`*Ids` arrays as a count). URLs and other fields are not printed.
- Known job types are read at runtime from `src/worker/queues/messages.ts`. Unknown or undecodable
  messages are summarized but never replayed unless `--type` names them.
- Replay is **at-least-once**: each batch is pushed to the main queue first and acked in the DLQ after
  that succeeds. A failure in between leaves a duplicate, never a lost job.
- Every message that is not replayed is released (retry with 0 s delay) at the end, also after an error
  or Ctrl-C, so it is visible again at once. If release fails, the lease expires on its own.
- Every pull counts as a delivery attempt on the DLQ. Past the pull consumer's `--message-retries`, the
  message is dropped. The script warns when a message has 80 or more attempts.
- Fix the cause before replaying. Otherwise the jobs fail 4 more times and come back.

**One-time setup: the DLQ needs an HTTP pull consumer.** Wrangler 4 rejects `type: "http_pull"` in
`queues.consumers` ("Only "worker" consumers can be configured in your Wrangler configuration"), so it
is not in `wrangler.jsonc`. Enable it once per queue (`wrangler deploy` leaves it in place):

```sh
pnpm exec wrangler queues consumer http add grant-autopilot-jobs-dlq --message-retries 100
pnpm exec wrangler queues update grant-autopilot-jobs-dlq --message-retention-period-secs 1209600
```

Without it the script exits with code 2 and prints the first command.

API calls (all under `https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID`):
`GET /queues?name=` (resolve ids, check for the pull consumer), `POST /queues/{dlq}/messages/pull`,
`POST /queues/{main}/messages/batch`, `POST /queues/{dlq}/messages/ack`.

## `d1-backup.mjs`: export D1, optionally store it in R2

```sh
node scripts/ops/d1-backup.mjs                                     # $TMPDIR/grant-autopilot-backups/grant-autopilot-<ts>.sql
node scripts/ops/d1-backup.mjs --out-dir ~/secure/backups          # pick the directory (outside the checkout)
node scripts/ops/d1-backup.mjs --upload --keep 30                  # + gzip, R2 upload, prune to the newest 30
node scripts/ops/d1-backup.mjs --upload --dry-run                  # print the plan; change nothing
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--env production\|demo` | production | sets the database and bucket |
| `--database <name>` | `grant-autopilot` (binding `DB`) | D1 database |
| `--out-dir <dir>` | `$TMPDIR/grant-autopilot-backups` | local directory; refused inside the git checkout |
| `--upload` | off | gzip and put the file at `<bucket>/<prefix><db>-<ts>.sql.gz` |
| `--bucket <name>` | `grant-autopilot-files` (env `BACKUP_BUCKET` overrides) | R2 bucket |
| `--prefix <p>` | `backups/d1/` | key prefix; must start with `backups/` |
| `--keep <n>` | 30 | after an upload, keep the newest n backups of this database; 0 = no prune |
| `--delete-local` | off | remove the local `.sql` / `.sql.gz` after a successful upload |
| `--dry-run` | off | print the commands; export, upload and delete nothing (the prune still lists R2, read-only, if credentials are set) |

What it runs (from `apps/grants`):

```sh
pnpm exec wrangler d1 export grant-autopilot --remote --output <dir>/grant-autopilot-<ts>.sql --skip-confirmation
pnpm exec wrangler r2 object put grant-autopilot-files/backups/d1/grant-autopilot-<ts>.sql.gz \
  --file <dir>/grant-autopilot-<ts>.sql.gz --remote --content-type application/gzip
pnpm exec wrangler r2 object delete grant-autopilot-files/backups/d1/<older>.sql.gz --remote   # prune
```

- The timestamp is UTC, `2026-11-19T09-43-07Z`, so names sort by time. The prune lists the prefix with
  `GET /accounts/{id}/r2/buckets/{bucket}/objects?prefix=` (wrangler has no object list; the endpoint
  is the one the official `cloudflare` SDK's `r2.buckets.objects.list` calls). It deletes only keys that
  match `<prefix><database>-<timestamp>.sql[.gz]`, never the object it just uploaded, and needs the two
  env vars (without them it skips the prune with a warning).
- **A running export blocks other D1 queries.** Run it at low traffic.
- **The dump contains every tenant's data.** The file is written with mode 0600 (a new directory is created 0700),
  and the script refuses an `--out-dir` inside the repo, which does not gitignore it. wrangler prints a
  one-hour presigned download URL for the export; the script redacts URLs from wrangler's output.
- The script checks that the file is non-empty SQL and prints sizes and SHA-256 hashes (the drill
  compares them).
- `wrangler r2 object put` uploads at most 300 MiB; the script stops with an error above that.
- Export does not support databases with virtual tables (FTS5). If one is added, this breaks; see
  the D1 import/export docs.
- Restore and the monthly drill: RUNBOOK.md section 12.

The nightly GitHub Actions job `.github/workflows/grants-backup.yml` runs
`d1-backup.mjs --upload --keep 30 --delete-local` at 09:43 UTC. It is skipped with a notice when
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are missing, runs only from the default branch, and
takes the repository variable `GRANTS_BACKUP_BUCKET` as the bucket when set.

## Tokens

| Script | Cloudflare token permissions |
| --- | --- |
| `dlq-replay.mjs` | Account, Queues, Edit |
| `d1-backup.mjs` | Account, D1, Edit (whether Read suffices for export is unverified); Account, Workers R2 Storage, Edit |

The deploy token in DEPLOY.md has all of these.
