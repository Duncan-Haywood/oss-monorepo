# ShootFlow private docs site

Next.js site that publishes internal ShootFlow documentation:

- **TSX guides** — product strategy, design decisions, workflow authority, business plan, terms summary.
- **HTML reports** — `docs/*.html` files are copied at build time via `npm run ingest-html` and embedded in `/docs/reports/[slug]`.

## Local development

```bash
cd docs-site
npm install
# Optional in dev: leave DOCS_SITE_PASSWORD unset to browse without login
DOCS_SITE_PASSWORD=your-secret npm run dev
```

Open http://localhost:3000. When `DOCS_SITE_PASSWORD` is set, middleware redirects to `/login`.

## Production build

```bash
npm run build
DOCS_SITE_PASSWORD=your-secret npm start
```

`prebuild` runs HTML ingest automatically.

## Deploy on Vercel (custom domain + security)

1. Import the repo and set **Root Directory** to `docs-site`.
2. Add environment variable **`DOCS_SITE_PASSWORD`** (Production + Preview). Use a long random value from a password manager.
3. Attach your private domain under **Project → Settings → Domains** (e.g. `docs.yourstudio.com`).
4. Enable **Deployment Protection** (Vercel Authentication or Password Protection) as a second layer if your team already uses it.
5. Keep **`robots: noindex`** (set in app metadata and `vercel.json` headers) so the site is not indexed.

### Security layers

| Layer | Purpose |
| --- | --- |
| `DOCS_SITE_PASSWORD` + middleware | App-level session cookie (HttpOnly, 14-day max age) |
| Vercel Deployment Protection | Platform gate before the app loads |
| Private DNS + non-public links | Reduces discovery |
| `noindex` headers | Discourages search indexing if URL leaks |

## Adding documentation

- **New guide page:** add `src/content/<name>.tsx`, route under `src/app/docs/<name>/page.tsx`, and an entry in `src/lib/navigation.ts`.
- **New HTML report:** add `docs/<name>.html` at repo root; rebuild runs ingest and adds `/docs/reports/<slug>`.

## HTML ingest manifest

`scripts/ingest-html-docs.mjs` writes:

- `public/generated/html/*.html` — static copies for iframe embedding
- `src/generated/html-manifest.json` — slugs, titles, and paths for Next routes
