# Cursor Automations — Print Atelier

Configure at **[cursor.com/automations](https://cursor.com/automations)** (not GitHub Actions).

## Primary automation: `Print Atelier Orchestrator`

| Setting | Value |
|---------|--------|
| **Name** | Print Atelier Orchestrator |
| **Trigger** | Scheduled → **Custom cron** → `0 * * * *` (hourly, UTC) |
| **Repository** | This repo |
| **Branch** | `main` |
| **Tools** | Open pull request · Memories (recommended) |
| **Prompt** | Copy entire file: [print-atelier-orchestrator.md](./print-atelier-orchestrator.md) |

### Campaign window (3 days → pause 1 year)

The **agent self-gates** via `docs/ORCHESTRATOR_CAMPAIGN.json`. The hourly cron can stay enabled in Cursor; outside the active window the agent exits in step 0 (minimal work).

To **stop billing entirely** during the 1-year pause, disable the automation in the Cursor dashboard on the last active run (the agent will remind you in `docs/PROGRESS.md`).

| Phase | Dates (default) | Agent behavior |
|-------|-----------------|----------------|
| Active | `campaign_start` → +3 days | Full orchestrator loop |
| Paused | +3 days → +1 year | Step 0 exit; log skip only |
| After pause | If `on_resume: new_campaign` | Agent rolls `campaign_start` forward and resumes |

Edit dates in [docs/ORCHESTRATOR_CAMPAIGN.json](../../docs/ORCHESTRATOR_CAMPAIGN.json).

## Optional: parallel hygiene automation

Second automation for git/PR cleanup only (narrower, faster runs):

| Setting | Value |
|---------|--------|
| **Trigger** | Scheduled → `30 * * * *` (hourly at :30, offset from main) |
| **Prompt** | Copy [print-atelier-hygiene.md](./print-atelier-hygiene.md) |

## Verify gate locally

```bash
node scripts/orchestrator-gate.mjs --status
```

Full setup: [docs/AUTOMATION_SETUP.md](../../docs/AUTOMATION_SETUP.md)
