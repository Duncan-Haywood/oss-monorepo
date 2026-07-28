# Orchestrator Automation Setup (Cursor only)

**Cursor Automation** runs **hourly** with no self-gating campaign window.

No GitHub Actions required for the orchestrator.

## Quick start

1. Open **[cursor.com/automations](https://cursor.com/automations)** → **New automation**
2. Configure using [.cursor/automations/README.md](../.cursor/automations/README.md)
3. Paste the **bootstrap prompt** from [.cursor/automations/print-atelier-orchestrator.md](../.cursor/automations/print-atelier-orchestrator.md) (section *Bootstrap prompt* — it points agents to read the full file from repo)
4. Set cron: **`0 * * * *`** (hourly, top of each hour UTC)
5. Attach **this repository**, branch `main`
6. Enable **Open pull request** + **Memories**
7. Save and enable

## How each run works

```
Cursor cron (0 * * * *, always on in dashboard)
        │
        ▼
Cloud Agent starts
        │
        ▼
Full orchestrator run (orient → hygiene → ship → close)
```

| Setting | Value |
|---------|--------|
| Schedule | Hourly — `0 * * * *` in Cursor dashboard |
| Branch | `main` |
| Stop runs | Disable the automation in Cursor dashboard |

## Optional parallel automation

Hygiene-only at `:15` and `:45` each hour — see [print-atelier-hygiene.md](../.cursor/automations/print-atelier-hygiene.md).

## Cost control

- ~**24** full runs per day when hourly cron is enabled
- **To stop billing:** disable the automation in Cursor dashboard

## State files

| File | Purpose |
|------|---------|
| `docs/PRODUCT.md` | Maturity tracker |
| `docs/BACKLOG.md` | Work queue |
| `docs/IDEAS.md` | Invention pipeline |
| `docs/PROGRESS.md` | Run log |

## Manual run

Trigger the automation manually from the Cursor Automations dashboard (Run now).
