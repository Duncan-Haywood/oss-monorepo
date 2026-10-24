<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Documentation

- Prefer not to add Markdown (`.md`) files for operator or product documentation.
- All substantive docs live as TSX pages under `src/app/docs/` and are served at `/docs/*`.
- Use the shared `DocPage` component (`src/components/docs/doc-page.tsx`) for consistent prose styling.
- `README.md` is minimal bootstrap only — link to `/docs` for full documentation.
