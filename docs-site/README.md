# ShootFlow private docs site

Next.js site for internal product, architecture, and commercial viability
documentation. Architecture, CLI, and security pages are **hand-authored TSX**;
HTML reports and selected markdown under `../docs/` are **rewritten as semantic
JSX** in `src/generated/doc-content/*.tsx` at build time (via `htmltojsx`).

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

1. Parses `docs/*.html` — converts body HTML to JSX, writes `src/generated/doc-content/<slug>.tsx` plus a thin `src/app/docs/reports/<slug>/page.tsx` wrapper.
2. Parses selected `docs/*.md` — markdown → HTML → JSX, same content module layout under `src/app/docs/<slug>/`.
3. Writes `src/generated/manifest.ts` for navigation metadata only.

## Documentation policy (TSX-first)

- **Canonical**: TSX in this app (`src/app/docs/**` or generated `src/generated/doc-content/*.tsx`).
- **Ingest only**: `../docs/*.html` and listed `../docs/*.md` are build inputs, not preferred editing surfaces for new guides.
- **One-off PDF/HTML**: run `npm run dev` or `npm run build && npm start`, open the route, then Print → Save as PDF or save the page as HTML. Do not treat repo-stored PDF/HTML as the source of truth unless explicitly required for legal/archival delivery.

Agent rule file: `../.cursor/rules/documentation-tsx.mdc`.

## Security

| Variable | Required (prod) | Purpose |
|----------|-------------------|---------|
| `DOCS_SITE_PASSWORD` | One of password/token | Basic Auth password |
| `DOCS_SITE_TOKEN` | One of password/token | Login form + Bearer (min 16 chars) |
| `DOCS_SITE_USERNAME` | No | Basic Auth user (default `shootflow`) |
| `DOCS_SITE_SESSION_SECRET` | Recommended | Session cookie after Basic Auth |
| `DOCS_SITE_DOMAIN` | No | Custom host for `metadataBase` / canonical URLs |

In production, missing both `DOCS_SITE_PASSWORD` and `DOCS_SITE_TOKEN` returns **503** (fail closed).

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
