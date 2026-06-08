# Print Atelier — Full-Stack Business Orchestrator

Autonomous **Cursor Automation** (every 30 minutes) owns the full company dev cycle: business strategy, product, engineering, GTM, sales, marketing, operations, and unit economics.

## Pillars

- **Software-first** — automate before hiring
- **AI-first** — capture, catalog, mockups, outreach, ads are the moat
- **Digital-first** — GTM through software channels (DM, email, SEO, ads APIs)
- **Dual-sided** — supply (artists) and demand (buyers) advance together

## State files (read every run)

| File | Purpose |
|------|---------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Maturity tracker (mock → MVP → launch) |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Curated work queue |
| [docs/IDEAS.md](docs/IDEAS.md) | Scored invention parking lot |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Run log + next-run recommendation |
| [docs/ORCHESTRATOR_CAMPAIGN.json](docs/ORCHESTRATOR_CAMPAIGN.json) | 1-day active / 1-year pause window |

## Automation (Cursor — not GitHub Actions)

| Item | Location |
|------|----------|
| Dashboard setup | [.cursor/automations/README.md](.cursor/automations/README.md) |
| Agent prompt | [.cursor/automations/print-atelier-orchestrator.md](.cursor/automations/print-atelier-orchestrator.md) |
| Hygiene prompt (optional) | [.cursor/automations/print-atelier-hygiene.md](.cursor/automations/print-atelier-hygiene.md) |
| Gate script | [scripts/orchestrator-gate.mjs](scripts/orchestrator-gate.mjs) |
| Setup guide | [docs/AUTOMATION_SETUP.md](docs/AUTOMATION_SETUP.md) |

**Schedule:** `*/30 * * * *` (every 30 min) at [cursor.com/automations](https://cursor.com/automations)

## Product map

```
CAPTURE → CATALOG → STOREFRONT → FULFILLMENT
              ↓
        GROWTH ENGINE (outreach, ads, CRM)
```

Pick **one vertical slice** per run when advancing engineering (Phase 2+).
