# ShootFlow private docs site

Next.js site that compiles repository `docs/` HTML reports and Markdown guides
into static pages behind HTTP Basic auth and optional Vercel Deployment
Protection.

## Architecture

| Layer | Role |
| --- | --- |
| `scripts/sync-docs.ts` | Build step: reads `../docs/*.html` and `../docs/*.md`, writes `generated/` |
| `app/*.tsx` | TSX shell, navigation, home, and doc routes |
| `middleware.ts` | Production gate via `DOCS_SITE_PASSWORD` (+ optional bypass header) |
| `vercel.json` | Security headers and Vercel build settings |

Most UI is TSX. Document bodies come from the sync step (HTML body extraction or
Markdown → HTML via `marked`).

## Local development

```bash
cd docs-site
npm install
cp .env.example .env.local
# Edit .env.local and set DOCS_SITE_PASSWORD for local auth testing

npm run dev
```

Open http://localhost:3000 and sign in with any username and your
`DOCS_SITE_PASSWORD`.

## Production deploy (Vercel)

1. Import the repo in Vercel and set **Root Directory** to `docs-site`.
2. Add environment variable `DOCS_SITE_PASSWORD` for Production (and Preview if
   desired).
3. Enable **Deployment Protection** → Password (or SSO) on the Vercel project for
   a second layer beyond app middleware.
4. Add a custom domain under **Domains** (e.g. `docs.yourcompany.com`) and point
   DNS per Vercel instructions.
5. Optionally set `DOCS_PROTECTION_BYPASS_SECRET` to match a Vercel protection
   bypass secret for automation only.

```bash
cd docs-site
npm run build
```

## Updating content

Edit files under repository `docs/`, then rebuild:

```bash
npm run sync-docs   # regenerate generated/manifest.json + html/*.json
npm run build
```

`CONTINUATION_NOTES.md` is excluded from the public site manifest (internal agent
notes only).

## Security notes

- `/api/health` is unauthenticated for uptime checks; it returns no document data.
- All other routes require Basic auth when `DOCS_SITE_PASSWORD` is set.
- Without `DOCS_SITE_PASSWORD` in production, middleware denies access.
- `X-Robots-Tag: noindex` is set on authenticated responses.
