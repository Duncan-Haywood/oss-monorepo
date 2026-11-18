# Running the igmp cloud worker yourself

`igmp worker` is the loop a cloud machine runs (design: [`../docs/CLOUD.md`](../docs/CLOUD.md)).
Each cycle it takes the bucket's lease, mirrors `library/` to local disk, runs every stage on the
Anthropic API under a daily token cap, pushes `outputs/` and a snapshot of its database, and writes
`status.json` and `status.html` to the bucket. Everything here runs in your own accounts; nothing
of ours sits in between.

What you need:

- an S3-compatible bucket (Cloudflare R2, Backblaze B2, AWS S3, MinIO) and an access key pair for it;
- an Anthropic API key;
- a machine that can run a container (or Python 3.12 with ffmpeg, exiftool and RawTherapee);
- a settings file: start from [`worker.config.toml.example`](worker.config.toml.example). It holds
  no secrets. Credentials only ever come from the environment: `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY` for the bucket, `ANTHROPIC_API_KEY` for Claude.

The worker refuses `backend = "claude-code"` (that is your personal Claude plan, meant for your own
Mac) unless the settings say `worker_allow_plan = true`, and refuses to start without `cloud_url`.

## The bucket (Cloudflare R2 with OpenTofu)

[`tofu/main.tf`](tofu/main.tf) creates one R2 bucket. It is not applied in CI.

```bash
export CLOUDFLARE_API_TOKEN=...          # a token that may edit R2 storage
cd deploy/tofu
tofu init
tofu apply -var account_id=<your account id>          # optional: -var bucket_name=...
```

The outputs are the `cloud_url` and `cloud_endpoint` for the settings file. The S3 access key pair
the worker uses is an R2 API token made in the Cloudflare dashboard (R2, "Manage R2 API Tokens"),
scoped to this bucket; that step is not in the OpenTofu config. Any other S3-compatible store works
the same way: set `cloud_endpoint` to its S3 endpoint and `cloud_region` to its region.

## The image

From the package folder (`ventures/ig-media-pipeline`):

```bash
docker build -f deploy/Dockerfile -t igmp-worker .
```

It is `python:3.12-slim-bookworm` with Debian's `ffmpeg`, `libimage-exiftool-perl` and
`rawtherapee` (for `rawtherapee-cli`), the package installed with its `cloud` extra (boto3), a
non-root user, the data volume at `/data` and `IGMP_CONFIG=/config/config.toml`. Siril is not
included; astro stacks use the built-in aligner without it.

## Locally with Docker

```bash
cp deploy/worker.config.toml.example ~/igmp-worker.toml     # edit cloud_url, cloud_endpoint
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... ANTHROPIC_API_KEY=...
docker run --rm \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e ANTHROPIC_API_KEY \
  -v ~/igmp-worker.toml:/config/config.toml:ro \
  -v igmp-data:/data \
  igmp-worker --once            # one cycle; drop --once to keep it running
```

`-e NAME` without a value passes the variable from your shell, so the keys are not written into
the command line history. Stop it with `docker stop` (SIGTERM): the worker gives up its lease and
exits. The `--once` / `--interval` flags are the `igmp worker` command's (wired in `cli.py`).

## On any Linux VM (systemd)

Install Docker, build or load the image, then:

```bash
sudo mkdir -p /etc/igmp
sudo cp deploy/worker.config.toml.example /etc/igmp/config.toml      # edit it
sudo install -m 600 /dev/null /etc/igmp/worker.env                   # then add the three keys:
#   AWS_ACCESS_KEY_ID=...
#   AWS_SECRET_ACCESS_KEY=...
#   ANTHROPIC_API_KEY=...
sudo cp deploy/igmp-worker.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now igmp-worker
journalctl -u igmp-worker -f
```

The unit ([`igmp-worker.service`](igmp-worker.service)) restarts the container if it exits and
stops it with SIGTERM.

## Fly.io (unverified)

[`fly.toml`](fly.toml) describes one machine with a volume at `/data`, the settings file copied in
with `[[files]]`, and the keys as Fly secrets; its header lists the commands. It has not been
deployed from this repository, so treat it as a starting point and run `fly config validate`
first. One thing to check: the image runs as a non-root user (uid 10001), and a fresh Fly volume
may be owned by root; if the worker cannot write `/data`, fix the ownership once from
`fly ssh console` (`chown -R 10001 /data`).

## What it costs

Three things cost money. Prices change, so check the providers' own pages rather than numbers here.

- **Object storage.** You pay per GB-month stored and per request; most providers also charge for
  data going out. The bucket holds the library (videos as 1920 px proxies by default,
  `cloud_video`), the outputs and the database. Cloudflare R2 has no egress fees and a free tier
  that includes 10 GB-month of storage a month:
  [R2 pricing](https://developers.cloudflare.com/r2/pricing/),
  [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing),
  [AWS S3 pricing](https://aws.amazon.com/s3/pricing/).
- **Compute.** One small VM or Fly machine that runs all the time. Rendering reels and RAW edits is
  CPU work, so more cores finish a backlog sooner; 2 vCPU and 4 GB of memory is a reasonable
  floor (an estimate, not a measured requirement). The local disk needs room for the mirrored
  library plus caches. See your provider's pricing, for example
  [Fly.io pricing](https://fly.io/docs/about/pricing/).
- **Anthropic API tokens.** Billed per token by model
  ([Anthropic pricing](https://www.anthropic.com/pricing)); bulk scoring and edit direction go
  through the Message Batches API at half price. The worker stops calling Claude for the rest of
  the UTC day once `worker_tokens_per_day` (default 2,000,000) input + output + cache-write tokens
  are used, so the daily spend is bounded by that many tokens at your model's prices. How the
  bound can be exceeded, by design: the last single call before the cap is not cut off, a batch
  is trimmed using a per-task estimate (the running average of earlier calls, x1.5) and can
  overshoot by that estimate's error, and cache reads are not counted toward the cap (they are
  billed at a fraction of the input price). Today's use against the cap is on `status.html`.

## Watching it

`status.html` in the bucket is a plain page (no scripts) with the last cycle's time and duration,
the counts of assets, scores, edits, reels and carousels, tokens used today against the cap, the
next cycle and any errors. `status.json` has the same data. If the bucket is private, open them
with your provider's console or `igmp cloud status`.
