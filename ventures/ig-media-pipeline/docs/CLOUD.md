# Cards to cloud: design

Goal: shoot, put the SD card or camera SSD in the Mac, run `igmp ingest`, and walk away. From
then on nothing depends on the Mac being on or on the card or photo drive being present: the
shots are in object storage, and a cloud worker scores them, edits them and makes reels
continuously. The Mac pulls the finished outputs whenever it is next on.

```
card ──ingest──> library root (or the spool when the photo drive is away)
                    │ verified copy, renamed to the catalog scheme
                    └──push──> bucket: library/<root name>/<rel>
                                   │
                         cloud worker (igmp worker): mirror library/ -> run every stage
                                   │   (backend = "api", a daily token cap)
                                   └──> bucket: outputs/, state/igmp.sqlite, status.json, status.html
Mac: igmp cloud pull ──> output_dir (or the outbox)
```

## Modules

| Module | Job |
|---|---|
| `ingest.py` | find cards, read capture times, plan names, copy verified, the ingest ledger, the spool |
| `bucket.py` | one small object-store interface; `LocalBucket` (a folder, for tests and NAS) and `S3Bucket` (any S3-compatible store: Cloudflare R2, Backblaze B2, AWS S3, MinIO) |
| `cloud.py` | push the library (video as originals or 1920 px proxies), pull outputs, seed the worker's state, the lease, status |
| `worker.py` | the continuous loop the cloud machine runs; the token budget; the status page |

`cli.py` wires them as `igmp ingest`, `igmp cloud push|pull|seed|status`, `igmp worker`.

## Settings (config.toml, read through `cfg.extra`)

```toml
# cloud_url = "s3://igmp-media"            # or "file:///Volumes/NAS/igmp" ; unset: cloud off
# cloud_endpoint = "https://<account>.r2.cloudflarestorage.com"   # S3-compatible endpoint
# cloud_region = "auto"
#   credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in the environment (never in this file)
# cloud_video = "proxy"                    # "proxy": 1920 px H.264 copies of clips, "original": as shot
# cloud_prefix = ""                        # a key prefix inside the bucket
# ingest_root = "/Volumes/PhotoDrive/2026" # default: the last library root
# ingest_location = ""                     # default place label for ingested shots
# worker_interval_s = 600                  # seconds between worker cycles
# worker_tokens_per_day = 2000000          # input+output tokens the worker may spend a UTC day
```

## Bucket layout

```
<prefix>library/<root name>/<path relative to the root>   originals or video proxies, same names
<prefix>outputs/<path relative to output_dir>             photos/, reels/, carousels/, ready/
<prefix>state/igmp.sqlite                                  the worker's database (a consistent snapshot)
<prefix>state/seed.sqlite                                  a Mac's database, uploaded once by `cloud seed`
<prefix>lease.json                                         which worker owns the state, until when
<prefix>status.json, status.html                           the worker's last cycle
```

Asset ids are `sha1("<root folder name>/<file stem>")`, so a file keeps its id in the library root,
the spool, and the worker's mirror, as long as the root folder name and the file name are kept.
Every layout above keeps both.

## The bucket interface (`bucket.py`)

```python
class Obj:  key: str; size: int; etag: str; mtime: float
class Bucket:
    def list(self, prefix: str = "") -> Iterator[Obj]
    def head(self, key: str) -> Obj | None
    def put_file(self, key: str, path: Path, *, meta: dict[str, str] | None = None) -> Obj
    def get_file(self, key: str, path: Path) -> Obj           # writes a temp name, then renames
    def put_bytes(self, key: str, data: bytes, *, if_match: str | None = None,
                  if_none_match: bool = False, content_type: str | None = None) -> Obj
                  # raises PreconditionFailed when the condition does not hold
    def get_bytes(self, key: str) -> tuple[bytes, Obj] | None
    def delete(self, key: str) -> None
def open_bucket(cfg) -> Bucket | None    # None when cloud_url is unset
```

`meta` carries `blake2b` (the backup module's digest of the source), so a push can tell an object
is the file it came from without downloading it.

## Rules

- Never delete anything from a card. `ingest` says when a card is safe to format: every file
  copied and verified, and (with cloud on) pushed.
- Never write under a missing `/Volumes/<drive>` (see `outputs.py`).
- The worker owns the state once it runs. The Mac only adds files (push) and takes outputs
  (pull). `cloud seed` hands a Mac's scores and plans to a worker that has none yet.
- The worker spends API tokens unattended, so it has a hard daily cap and stops calling Claude
  when the cap is reached. It never uses the `claude-code` backend unless told to.
- Credentials come from the environment, never from a file in this repository.
