# Orchestrator Automation Setup (Cursor only)

Hourly **Cursor Automation** for **3 days**, then **self-paused for 1 year** (configurable).

No GitHub Actions required for the orchestrator.

## Quick start

1. Open **[cursor.com/automations](https://cursor.com/automations)** → **New automation**
2. Configure using [.cursor/automations/README.md](../.cursor/automations/README.md)
3. Paste prompt from [.cursor/automations/print-atelier-orchestrator.md](../.cursor/automations/print-atelier-orchestrator.md)
4. Set cron: `0 * * * *` (every hour UTC)
5. Attach **this repository**, branch `main`
6. Enable **Open pull request** + **Memories**
7. Save and enable

## How the 3-day / 1-year window works

```
Cursor cron (hourly, always on in dashboard)
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
| Active | 3 days from start | `active_days` in `docs/ORCHESTRATOR_CAMPAIGN.json` |
| Pause | 365 days | `pause_days` |
| Hard stop | Agent sets `enabled: false` on last active hour | automatic |
| Zero-cost pause | Disable automation in Cursor dashboard | manual (agent reminds you) |

### Campaign config

`docs/ORCHESTRATOR_CAMPAIGN.json`:

```json
{
  "campaign_start": "2026-06-08T00:00:00Z",
  "active_days": 3,
  "pause_days": 365,
  "enabled": true,
  "on_resume": "stop"
}
```

| Field | Meaning |
|-------|---------|
| `campaign_start` | First allowed run |
| `active_days` | Full work window (default 3) |
| `pause_days` | Idle window after active (default 365) |
| `enabled` | `false` = agent always skips |
| `on_resume` | `stop` = stay idle after pause; `new_campaign` = agent starts new 3-day window when pause ends |

### Test gate locally

```bash
node scripts/orchestrator-gate.mjs --status
node scripts/orchestrator-gate.mjs          # exit 0 = active, 1 = skip
```

## Optional parallel automation

Hygiene-only runs at `:30` each hour — see [print-atelier-hygiene.md](../.cursor/automations/print-atelier-hygiene.md).

## Cost control

- ~72 full runs per 3-day campaign (hourly)
- During 1-year pause: agent exits at step 0 (small cost per hourly trigger)
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
