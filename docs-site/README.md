# ShootFlow private docs site

Next.js documentation site for internal product, architecture, and HTML reports. Most pages are authored in **TSX**; HTML files under `../docs/*.html` are converted at **build time** into generated React modules.

## Local development

```bash
cd docs-site
cp .env.example .env.local
# Set DOCS_SITE_TOKEN in .env.local for auth testing
npm install
npm run dev
```

Open http://localhost:3000. Without `DOCS_SITE_TOKEN`, auth is bypassed in development only.

## Build

```bash
npm run sync-html   # regenerate src/generated/html-docs from ../docs/*.html
npm run build       # runs sync-html via prebuild, then next build
```

## Security model

1. **Application auth** — Set `DOCS_SITE_TOKEN` (min 16 characters). Users sign in at `/login`; the server issues an HMAC-signed httpOnly cookie. API/scripts may pass `Authorization: Bearer <token>`.
2. **Platform auth (recommended)** — On Vercel, enable [Deployment Protection](https://vercel.com/docs/security/deployment-protection) (SSO or password) on the project in addition to app token auth.
3. **Private domain** — Attach a team-only hostname (for example `docs.shootflow.internal`) and set `DOCS_SITE_DOMAIN` so metadata and docs reference the correct origin.
4. **Headers** — `vercel.json` sets `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`. `robots` meta blocks indexing.

Production returns **503** if `DOCS_SITE_TOKEN` is missing.

## Deploy to Vercel

1. Create a Vercel project with root directory `docs-site`.
2. Set environment variables:
   - `DOCS_SITE_TOKEN` — required
   - `DOCS_SITE_DOMAIN` — your custom domain hostname
3. Add the custom domain under **Project → Settings → Domains**.
4. Enable Deployment Protection for the production environment.
5. Deploy from `main` (GitHub Action `docs-site.yml` also validates builds on PRs).

## Repository layout

| Path | Role |
|------|------|
| `scripts/build-from-html.mjs` | Parses `docs/*.html` → `src/generated/html-docs/*.tsx` |
| `src/app/**/page.tsx` | Hand-authored TSX documentation |
| `src/app/reports/[slug]` | Routes for generated HTML reports |
| `src/middleware.ts` | Session and bearer token gate |
