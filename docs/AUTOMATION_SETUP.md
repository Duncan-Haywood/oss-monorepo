# Orchestrator Automation Setup (Cursor only)

**Cursor Automation** **hourly** for **1 day**, then **self-paused for 1 year** (configurable).

No GitHub Actions required for the orchestrator.

## Quick start

1. Open **[cursor.com/automations](https://cursor.com/automations)** → **New automation**
2. Configure using [.cursor/automations/README.md](../.cursor/automations/README.md)
3. Paste the **bootstrap prompt** from [.cursor/automations/print-atelier-orchestrator.md](../.cursor/automations/print-atelier-orchestrator.md) (section *Bootstrap prompt* — it points agents to read the full file from repo)
4. Set cron: **`0 * * * *`** (hourly, top of each hour UTC)
5. Attach **this repository**, branch `main`
6. Enable **Open pull request** + **Memories**
7. Save and enable

## How the 1-day / 1-year window works

```
Cursor cron (0 * * * *, always on in dashboard)
        │
        ▼
Cloud Agent starts
        │
        ▼
Step 0: node scripts/orchestrator-gate.mjs --status
        │
        ├─ allowed=true  → full orchestrator run (hygiene + invent + ship)
        │
        └─ allowed=false → log skip to PROGRESS.md, stop (~minimal cost)
```

| Window | Default | Config |
|--------|---------|--------|
| Active | 1 day from start | `active_days` in `docs/ORCHESTRATOR_CAMPAIGN.json` |
| Schedule | Hourly | `0 * * * *` in Cursor dashboard |
| Pause | 365 days | `pause_days` |
| Hard stop | Agent sets `enabled: false` on last active run | automatic |
| Zero-cost pause | Disable automation in Cursor dashboard | manual (agent reminds you) |

### Campaign config

`docs/ORCHESTRATOR_CAMPAIGN.json`:

```json
{
  "campaign_start": "2026-06-08T00:00:00Z",
  "active_days": 1,
  "pause_days": 365,
  "schedule_cron": "0 * * * *",
  "enabled": true,
  "on_resume": "stop"
}
```

| Field | Meaning |
|-------|---------|
| `campaign_start` | First allowed run |
| `active_days` | Full work window (default **1**) |
| `schedule_cron` | Documented Cursor cron (set in dashboard) |
| `pause_days` | Idle window after active (default 365) |
| `enabled` | `false` = agent always skips |
| `on_resume` | `stop` = stay idle after pause; `new_campaign` = agent starts new 1-day window when pause ends |

### Test gate locally

```bash
node scripts/orchestrator-gate.mjs --status
node scripts/orchestrator-gate.mjs          # exit 0 = active, 1 = skip
```

## Optional parallel automation

Hygiene-only at `:15` and `:45` each hour — see [print-atelier-hygiene.md](../.cursor/automations/print-atelier-hygiene.md).

## Cost control

- ~**24** full runs per 1-day campaign (hourly × 24 h)
- During 1-year pause: agent exits at step 0 (small cost per trigger)
- **To pay nothing during pause:** disable the automation in Cursor dashboard when the agent logs campaign end
- Emergency stop: set `"enabled": false` in campaign JSON and push to `main`

## State files

| File | Purpose |
|------|---------|
| `docs/ORCHESTRATOR_CAMPAIGN.json` | Schedule gate |
| `docs/PRODUCT.md` | Maturity tracker |
| `docs/BACKLOG.md` | Work queue |
| `docs/IDEAS.md` | Invention pipeline |
| `docs/PROGRESS.md` | Run log |
| `scripts/orchestrator-gate.mjs` | Gate logic (agent runs this) |

## Manual run

Trigger the automation manually from the Cursor Automations dashboard (Run now).
