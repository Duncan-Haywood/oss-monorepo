# Documentation

Product docs live in **`apps/docs`** as **TSX pages**. Standalone **HTML/Markdown** in this folder and in `reports/` are synced into the site at build time.

**Commercial viability report** (source HTML): [`commercial-viability-report.html`](./commercial-viability-report.html) — also available in the built site at `#/reports/commercial-viability-report` after `pnpm docs:sync`.

Key TSX pages: **ROI & priorities** (`/roi`), **Business plan** (`/business-plan`), **Roadmap** (`/roadmap`), **HTML reports** index (`/reports`).

```bash
pnpm docs:sync    # ingest docs/*.html, reports/*.html → generated TS modules
pnpm docs:dev     # private passcode gate (see .env.example)
pnpm docs:build   # → apps/docs/dist
```

**Deploy, custom domain, and security:** [deployment.md](./deployment.md).

CI syncs HTML, builds, and uploads `apps/docs/dist` on every push to `main`.
