# @retail-pilot/analytics

SQLite rollups (Node 22 `node:sqlite`).

```bash
pnpm exec tsx packages/analytics/src/cli.ts init
pnpm exec tsx packages/analytics/src/cli.ts sync
pnpm exec tsx packages/analytics/src/cli.ts report --date today
pnpm exec tsx packages/analytics/src/cli.ts serve-kpis --port 8787
```

`serve-kpis` is a read-only LAN HTTP server. It binds `127.0.0.1` by default and serves joined daily KPIs from SQLite:

- `GET /health`
- `GET /api/kpis/today`
- `GET /api/kpis/latest` — most recent day with door or POS activity
- `GET /api/kpis?date=YYYY-MM-DD`

Point the portal at it with `VITE_PILOT_API_URL=http://127.0.0.1:8787`. Use `--host 0.0.0.0` only on a trusted store LAN. CORS defaults to the local portal origins.
