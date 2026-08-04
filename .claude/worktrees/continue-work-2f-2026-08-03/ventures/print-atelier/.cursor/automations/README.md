# Cursor Automations — Print Atelier

Configure at **[cursor.com/automations](https://cursor.com/automations)** (not GitHub Actions).

## Primary automation: `Print Atelier Orchestrator`

| Setting | Value |
|---------|--------|
| **Name** | Print Atelier Orchestrator |
| **Trigger** | Scheduled → **Custom cron** → `0 * * * *` (hourly, top of each hour UTC) |
| **Repository** | This repo |
| **Branch** | `main` |
| **Tools** | Open pull request · Memories (recommended) |
| **Prompt** | Paste **bootstrap** from [print-atelier-orchestrator.md](./print-atelier-orchestrator.md) (*Bootstrap prompt* section — agent reads full file from repo each run) |

The hourly cron runs continuously. To stop orchestrator runs, disable the automation in the Cursor dashboard.

## Optional: parallel hygiene automation

Second automation for git/PR cleanup only (narrower, faster runs):

| Setting | Value |
|---------|--------|
| **Trigger** | Scheduled → `15,45 * * * *` (every 30 min at :15 and :45, offset from main) |
| **Prompt** | Copy [print-atelier-hygiene.md](./print-atelier-hygiene.md) |

Full setup: [docs/AUTOMATION_SETUP.md](../../docs/AUTOMATION_SETUP.md)
