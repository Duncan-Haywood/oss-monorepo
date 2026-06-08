# Cursor Automations — Print Atelier

Configure at **[cursor.com/automations](https://cursor.com/automations)** (not GitHub Actions).

## Primary automation: `Print Atelier Orchestrator`

| Setting | Value |
|---------|--------|
| **Name** | Print Atelier Orchestrator |
| **Trigger** | Scheduled → **Custom cron** → `*/30 * * * *` (every 30 minutes, UTC) |
| **Repository** | This repo |
| **Branch** | `main` |
| **Tools** | Open pull request · Memories (recommended) |
| **Prompt** | Copy entire file: [print-atelier-orchestrator.md](./print-atelier-orchestrator.md) |

### Campaign window (1 day → pause 1 year)

The **agent self-gates** via `docs/ORCHESTRATOR_CAMPAIGN.json`. The 30-minute cron can stay enabled in Cursor; outside the active window the agent exits in step 0 (minimal work).

To **stop billing entirely** during the 1-year pause, disable the automation in the Cursor dashboard on the last active run (the agent will remind you in `docs/PROGRESS.md`).

| Phase | Dates (default) | Agent behavior |
|-------|-----------------|----------------|
| Active | `campaign_start` → +1 day | Full orchestrator loop (~48 runs) |
| Paused | +1 day → +1 year | Step 0 exit; log skip only |
| After pause | If `on_resume: new_campaign` | Agent rolls `campaign_start` forward and resumes |

Edit dates in [docs/ORCHESTRATOR_CAMPAIGN.json](../../docs/ORCHESTRATOR_CAMPAIGN.json).

## Optional: parallel hygiene automation

Second automation for git/PR cleanup only (narrower, faster runs):

| Setting | Value |
|---------|--------|
| **Trigger** | Scheduled → `15,45 * * * *` (every 30 min at :15 and :45, offset from main) |
| **Prompt** | Copy [print-atelier-hygiene.md](./print-atelier-hygiene.md) |

## Verify gate locally

```bash
node scripts/orchestrator-gate.mjs --status
```

Full setup: [docs/AUTOMATION_SETUP.md](../../docs/AUTOMATION_SETUP.md)
