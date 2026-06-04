# ShootFlow private docs site

Next.js site that publishes repository documentation behind password protection.

- **Hand-authored TSX**: home overview, security/deployment guide, shell layout/navigation.
- **Build-time sync**: `npm run sync` ingests `../docs/*.html` and `../docs/*.md` into generated App Router pages under `src/app/reports/` and `src/app/internal/`.
- **Private by default**: middleware blocks production traffic unless `DOCS_ACCESS_PASSWORD` and `DOCS_SESSION_SECRET` are configured.

## Commands

```bash
cd docs-site
npm install
npm run sync    # regenerate routes from ../docs
npm run dev     # local preview (open access without env vars)
npm run build   # sync + production build
```

## Deploy on Vercel with a custom domain

1. Create a new Vercel project with **Root Directory** = `docs-site`.
2. Set environment variables (Production + Preview if desired):
   - `DOCS_ACCESS_PASSWORD`
   - `DOCS_SESSION_SECRET`
3. Add your domain under **Settings → Domains** (for example `docs.yourdomain.com`).
4. Optional: enable **Deployment Protection** on the production environment for an additional platform password/SSO gate.

## Security model

| Layer | Behavior |
| --- | --- |
| Middleware | Requires session cookie or HTTP Basic password in production |
| Metadata | `robots: noindex` on all pages |
| Vercel headers | `X-Robots-Tag`, `X-Frame-Options`, `Referrer-Policy` |
| Platform | Recommended Deployment Protection + non-public previews |

## Adding documentation

- **HTML reports**: add or edit files in `/docs/*.html`, then run `npm run sync`.
- **Markdown**: add `/docs/*.md` (subfolders allowed; `docs/superpowers/` is excluded).
- **New TSX pages**: add routes under `src/app/(site)/` for handbook-style content that should not come from `docs/`.
