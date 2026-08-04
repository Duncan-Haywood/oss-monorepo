# Retail Pilot Intel — Orchestrator index

Hourly (or half-hourly) Cursor Automation runs use **`.cursor/automations/retail-pilot-intel-orchestrator.md`** as the authoritative prompt.

## Bootstrap (paste in Cursor Automation dashboard)

```
You are the Retail Pilot Intel Launch & Pilot Orchestrator (scheduled: `0 * * * *` or `*/30 * * * *` UTC).

Read and execute `.cursor/automations/retail-pilot-intel-orchestrator.md` from this repository on branch `main`. That file is authoritative — follow every step in order starting with Step 1 (Orient). Do not substitute a shorter workflow.
```

## State files (agent-maintained)

| File | Purpose |
|------|---------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Subsystem maturity (0–5) + milestone gates M0–M5 |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Curated work queue (`ready` / `in_progress` / `done`) |
| [docs/IDEAS.md](docs/IDEAS.md) | Scored idea parking lot |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Run log (newest first) |

## Verify locally

```bash
pnpm install
pnpm run ci   # typecheck, lint, build, bootstrap smoke
```

## Human entry points

- **Docs:** `pnpm docs:dev` → http://localhost:5173 (passcode: `pilot-docs`)
- **Sales portal:** `pnpm portal:dev` → http://localhost:5174 (passcode: `atelier-demo`)
- **Data pipeline:** `pnpm bootstrap`
