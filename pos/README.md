# POS connector

Normalizes vendor-specific exports into `SaleEvent` (see `schemas/sale_event.schema.json`).

## Adapters

| Adapter | Status |
|---------|--------|
| `csv_generic` | Stub — column-mapped CSV |
| Vendor API | TBD per pilot POS |

## Run (stub)

```bash
python -m pos.ingest --sample
```

Place real exports in `data/pos/inbox/` (gitignored).
