# ShootFlow private docs site

Next.js (App Router) site that publishes repo documentation with:

- **TSX shell** — layout, navigation, home, and security guides
- **Markdown routes** — `docs/*.md` rendered at `/docs/[slug]`
- **HTML build step** — `docs/*.html` ingested into `src/generated/` for `/reports/[slug]`
- **Private access** — HTTP Basic Auth middleware plus Vercel Deployment Protection

## Quick start

```bash
cd docs-site
npm ci
npm run dev
```

Open http://localhost:3000 (auth disabled until `DOCS_AUTH_*` is set).

## Build

```bash
npm run build:content   # ingest ../docs/*.html
npm run build           # content + next build
```

## Deploy on Vercel

1. Import the repository and set **Root Directory** to `docs-site`.
2. Add environment variables:
   - `DOCS_AUTH_USER`
   - `DOCS_AUTH_PASSWORD`
3. Enable **Deployment Protection → Password Protection** for production and previews.
4. Add a custom domain under **Domains** (e.g. `docs.yourdomain.com`) and configure DNS.
5. Deploy. The site sets `robots: noindex` and requires credentials when configured.

## Security model

| Layer | Purpose |
| --- | --- |
| Middleware Basic Auth | App-level gate using `DOCS_AUTH_USER` / `DOCS_AUTH_PASSWORD` |
| Vercel Password Protection | Platform gate if middleware is bypassed |
| Custom domain + noindex | Reduces accidental public indexing |

See `/security` in the running site for full setup notes.

## Adding documentation

- **Markdown:** add an entry in `src/lib/docs-registry.ts` pointing at `docs/YourFile.md`.
- **HTML reports:** add `docs/your-report.html` and run `npm run build:content`.
- **Native TSX pages:** add routes under `src/app/` and link from `DocsShell` navigation.
