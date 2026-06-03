# Hosting private documentation

Product docs are a static Vite build (`apps/docs/dist`). They must stay **human-readable on the web** but **not public** — use layered access, not “security through obscurity” alone.

## Recommended: Vercel (static + password protection)

| Layer | What it does |
|-------|----------------|
| **Vercel Deployment Protection** | Platform password before any HTML loads (Pro). Configure in Project → Settings → Deployment Protection. |
| **Docs passcode gate** | App-level gate (`VITE_DOCS_PASSCODE`). Enabled by default; disable locally with `VITE_DOCS_GATE=off`. |
| **Private GitHub repo** | Source and CI artifacts stay org-only. |

### One-time setup

1. Create a Vercel project linked to this repo (root directory = repository root; `vercel.json` already sets build/output).
2. Add **Production** environment variables in Vercel:
   - `VITE_DOCS_PASSCODE` — team passcode (rotate when people leave).
   - Optional: `VITE_DOCS_GATE=off` if you rely only on Vercel password protection.
3. Enable **Password Protection** for Production (and previews if desired).
4. In GitHub → Settings → Secrets and variables → Actions:
   - Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `DOCS_PASSCODE` (used at CI build time).
   - Variable: `DOCS_DEPLOY_ENABLED` = `true`
5. Push to `main` (or run **Deploy docs** workflow manually). URL appears in the workflow’s `production` environment.

Hash routes (`#/roi`, `#/business-plan`) work without SPA rewrites — good for static hosts.

### Local development

```bash
pnpm docs:dev                    # gate on (default passcode: atelier-docs)
VITE_DOCS_GATE=off pnpm docs:dev # skip gate while editing
```

## Alternative: GitHub Actions artifact (no public URL)

CI already uploads `docs-dist` on every run. Anyone with repo access can download the zip from the Actions run → **Artifacts** → open `index.html` locally. No hosting cost; less convenient than a bookmarkable URL.

## Alternatives (usually weaker for “private”)

| Option | Private? | Notes |
|--------|----------|--------|
| **GitHub Pages** (free, private repo) | **No** — site is still public on the internet | Fine for open docs only. |
| **GitHub Pages** (Enterprise) | Internal visibility | Requires Enterprise. |
| **Netlify / Cloudflare Pages** | Password or Access rules | Similar to Vercel; pick one platform. |
| **Client passcode only** | Weak | Static assets are downloadable; use with host-level protection. |

## Sales demo portal

The **portal** (`apps/portal`) is a separate Vite app with its own passcode (`VITE_DEMO_PASSCODE`). Deploy as a second Vercel project when you need a stakeholder demo — same protection pattern as docs.

## Security note

Passcodes in the frontend bundle are **obfuscation for pilot sharing**, not production IAM. For investor or operator access at scale, use Vercel Authentication, Cloudflare Access, or an identity provider — and keep the repo private.
