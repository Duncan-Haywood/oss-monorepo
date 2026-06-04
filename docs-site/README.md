# ShootFlow private docs site

Next.js site for internal product, architecture, and commercial viability
documentation. Most navigation and policy pages are authored in **TSX**; HTML
reports and long markdown files are **ingested at build time** from `../docs/`.

## Local development

```bash
cd docs-site
npm ci
npm run dev
```

Open http://localhost:3000 (no auth in development unless you set env vars).

## Production build

```bash
npm run build
```

`prebuild` runs `scripts/build-docs.mjs`, which:

1. Parses `docs/*.html` — extracts `<title>`, `<style>`, and `<main>` body HTML.
2. Parses selected `docs/*.md` — renders to HTML via `marked`.
3. Writes `src/generated/content.ts` for static report/archive routes.

## Security

| Variable | Required (prod) | Purpose |
|----------|-------------------|---------|
| `DOCS_SITE_PASSWORD` | Yes | Basic Auth password |
| `DOCS_SITE_USERNAME` | No | Basic Auth user (default `shootflow`) |
| `DOCS_SITE_SESSION_SECRET` | Recommended | Session cookie after auth |

In production, missing `DOCS_SITE_PASSWORD` returns **503** (fail closed).

Also enable **Vercel Deployment Protection** (password or SSO) on the project for
defense in depth.

## Custom domain

1. Deploy with root directory `docs-site`.
2. Vercel → Project → **Domains** → add e.g. `docs.yourdomain.com`.
3. Configure DNS per Vercel instructions (CNAME or A record).

## Deploy on Vercel

```bash
cd docs-site
npx vercel --prod
```

Set environment variables in the Vercel dashboard before promoting to production.
