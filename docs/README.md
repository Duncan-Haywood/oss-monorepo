# Documentation sources

Product narrative lives in **`apps/docs`** as **TSX pages** (canonical). This folder holds **HTML/Markdown sources** that are compiled into the site at build time.

| Source | Role |
|--------|------|
| `commercial-viability-report.html` | Long-form commercial assessment |
| `README.md` | This index (synced into the docs archive) |
| `../reports/*.html` | Additional viability reports |

```bash
pnpm docs:sync    # HTML/MD → apps/docs/public/generated + manifest
pnpm docs:dev     # passcode: atelier-docs (see .env.example)
pnpm docs:build
```

In the built app: **Commercial viability** (`#/commercial-viability`) is TSX; full HTML tables live under **HTML archive** (`#/archive/...`). Deploy with domain + Vercel Deployment Protection — `apps/docs/DEPLOY.md`.
