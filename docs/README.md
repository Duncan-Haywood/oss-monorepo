# Documentation

Product docs live in **`apps/docs`** as TSX pages, built with Vite + React Router (hash URLs — works on any static host).

Key pages: **ROI & priorities** (`#/roi`), **Business plan** (`#/business-plan`), **Roadmap** (`#/roadmap`).

## Local development

```bash
pnpm install
pnpm docs:dev      # http://localhost:5173
pnpm docs:build    # output: apps/docs/dist
```

Default passcode: `atelier-docs` (override with `VITE_DOCS_PASSCODE` in `.env`).

## Private hosting (recommended: Vercel)

The site is a static SPA. Privacy uses **two layers** (use both in production):

1. **Vercel Deployment Protection** — project → Settings → Deployment Protection → **Password Protection** on production (and previews if desired). Stops casual URL discovery; requires a Vercel plan that includes protection.
2. **App passcode** — `VITE_DOCS_PASSCODE` baked at build time; session in `sessionStorage` (12 h). Stops sharing the built bundle without the passcode.

### One-time Vercel setup

1. Import this repo in [Vercel](https://vercel.com/new) (root directory = repository root; `vercel.json` sets build/output).
2. Add environment variable **`VITE_DOCS_PASSCODE`** (Production + Preview) — use a strong value, not the dev default.
3. Enable **Password Protection** on the docs project if your team has it.
4. Link the project and add GitHub Actions secrets:

| Secret | Where to find it |
|--------|------------------|
| `VERCEL_TOKEN` | Vercel → Account → Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` after `vercel link`, or project settings API |
| `VERCEL_PROJECT_ID` | same |
| `DOCS_PASSCODE` | same value as `VITE_DOCS_PASSCODE` (for CI builds) |

After secrets exist, pushes to `main` that touch docs run **Deploy docs** (`.github/workflows/deploy-docs.yml`) and publish `apps/docs/dist`.

### Alternatives

| Option | Private? | Human-readable? | Notes |
|--------|----------|-----------------|-------|
| **Vercel** (above) | Yes (password + passcode) | Yes | Best default for stakeholders |
| **GitHub Actions artifact** | Repo collaborators only | Download zip, open `index.html` | CI already uploads `docs-dist` on every run |
| **GitHub Pages** | Private only on paid org plans | Yes | Possible; not configured here |
| **`pnpm docs:preview`** | Local only | Yes | Quick check of production build |

## CI

`pnpm run ci` typechecks, lints, builds docs + portal, and smoke-tests bootstrap. On `main`, artifacts `docs-dist` and `portal-dist` are uploaded for collaborator download.
