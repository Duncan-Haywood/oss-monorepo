# Documentation

Product docs live in **`apps/docs`** as TSX pages, built with Vite.

Key pages: **ROI & priorities** (`/roi`), **Business plan** (`/business-plan`), **Roadmap** (`/roadmap`).

Planning starts at **Business value & ROI** (`/roi`) — ranks 1–3 first (door+POS, desirability gap, upsell), then weighted score, build cost, payback, and monthly/annual € scenarios for the Italy leather boutique pilot. **Roadmap** maps milestones M1–M5+ to that order.

## Local development

```bash
pnpm docs:dev          # http://localhost:5173 — passcode: pilot-docs (or VITE_DOCS_PASSCODE)
pnpm docs:build        # output: apps/docs/dist
```

## Private hosting (human-readable, not public)

The docs are a static SPA (HashRouter). Choose one deployment path:

### GitHub Pages (recommended for private repos)

1. Repo **Settings → Pages → Build and deployment**: set source to **GitHub Actions**.
2. On a **private** repo with GitHub Team/Enterprise, set Pages visibility to match the repo so only collaborators can open the URL.
3. Add repository secret **`DOCS_PASSCODE`** (production passcode; baked into the build).
4. Push to `main` — workflow **Deploy docs** builds and publishes `apps/docs/dist`.

URL shape: `https://<org>.github.io/<repo>/` (workflow sets `VITE_BASE_PATH` automatically).

### Vercel (optional)

1. Import `apps/docs` as a Vercel project (see `apps/docs/vercel.json`).
2. Enable **Deployment Protection** (Vercel Authentication or password) in the Vercel dashboard for real access control.
3. Set env `VITE_DOCS_PASSCODE` in Vercel.
4. To deploy from CI: set repo variable `VERCEL_DOCS_DEPLOY=true` and secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

### Docker (LAN / pilot edge)

```bash
pnpm docs:build
docker compose up docs -d   # http://localhost:8080
```

Nginx config: `deploy/nginx/docs.conf` (optional HTTP basic auth — see comments in file).

### Security note

The in-app passcode is a **stakeholder gate**, not cryptographic protection (assets ship in the bundle). For confidential business plan content, rely on **private GitHub Pages**, **Vercel deployment protection**, or **HTTP basic auth** on nginx — not the passcode alone.

CI builds and uploads `apps/docs/dist` on every push to `main` (artifact). The **Deploy docs** workflow publishes to GitHub Pages when enabled.
