# Run records

One JSON file per run, written by
`python3 prompts/promptctl.py record` and committed as the last commit of the
run's pull request. One file per run rather than a shared log, because
parallel runs that append to the same file always conflict.

File name: `<YYYY-MM-DD>-<session id>.json`. The fields are listed in
`RECORD_FIELDS` in [`../promptctl.py`](../promptctl.py), and
`promptctl.py validate` (run in CI) checks them. Once merged, a record changes
only to fill in a `null` field (such as `merged`), and every change adds an
entry to its `corrections` list.
