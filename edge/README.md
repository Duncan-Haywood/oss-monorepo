# Edge (on-device vision)

Processes RTSP from the indoor door camera on the store LAN. Emits only `AggregateEvent` records — no raw video persistence in production.

## Planned stack

- Python 3.12+ with OpenCV / GStreamer ingest
- Lightweight person detection + line-crossing (no face recognition)
- Optional zone maps for fixture engagement

## Configuration

Copy `.env.example` at repo root; set `RTSP_URL`, `STORE_ID`, `EDGE_DB_PATH`.

## Run (stub)

```bash
python -m edge.ingest --help
```

Implementation status: **scaffold** — see `edge/ingest.py`.
