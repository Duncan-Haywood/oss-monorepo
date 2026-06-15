# AGENTS.md

## Cursor Cloud specific instructions

This repo is currently a single runnable artifact: the **Listing Lens market research report**, a Next.js 14 (App Router) static-export site. There is no backend, database, or auth — the strategy docs intentionally scope those out for now.

- **All app code and the `package.json` live in `research/`** (not the repo root). Run npm commands from there (e.g. `npm run dev`) or use `--prefix research`. Dependencies are installed automatically on startup by the update script.
- **Run (dev):** `cd research && npm run dev` → serves on http://localhost:3000.
- **Build:** `cd research && npm run build` → produces a static export in `research/out/` (`next.config.js` sets `output: "export"`). `npm run start` is not meaningful for a static export.
- **Lint/typecheck gotcha:** `npm run lint` (`next lint`) hangs because no ESLint config is committed — it tries to prompt interactively to create one. Instead, validate lint + TypeScript via `npm run build`, which runs the "Linting and checking validity of types" step non-interactively and fails on errors.
- No environment variables are required for dev or build.
