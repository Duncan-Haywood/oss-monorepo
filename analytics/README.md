# Analytics

Rolls up `AggregateEvent` and `SaleEvent` into time buckets and pilot KPIs.

## Run

```bash
python -m analytics.db init
python -m analytics.report --date today
```

Uses SQLite at `data/pilot.db` by default.
