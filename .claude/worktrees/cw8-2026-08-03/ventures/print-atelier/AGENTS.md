# AGENTS.md

## Cursor Cloud Notes

Print Atelier is currently a frontend-only Next.js 14 app with shared TypeScript business logic. There is no database, backend service, Docker dependency, or required environment variable for local development.

## Services

| Service | Command | Port |
|---------|---------|------|
| Next.js dev server | `npm run dev` | 3000 |

Use tmux for long-running dev servers so browser testing can continue across shell commands:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s next-dev-server -c /workspace -- npm run dev
```

## Standard Commands

- Install: `npm ci`
- Dev: `npm run dev`
- Test shared business logic: `npm test`
- Build and type-check: `npm run build`

`npm run lint` currently invokes `next lint`; prefer `npm run build` as the reliable verification path until an explicit ESLint config is committed.

## Code Layout

- Business plan sections live in `src/components/*.tsx`.
- Demo and portal routes live in `src/app/*`.
- Shared marketplace, payout, CAC, creative, and budget math lives in `src/lib/marketplace.ts`.
- Shared outreach scoring and reply triage lives in `src/lib/outreach.ts`.
- Unit tests for shared logic live in `tests/*.test.ts`.

## Smoke Routes

After starting the dev server, the most useful browser smoke routes are:

- `/` - business plan dashboard
- `/storefront` - buyer storefront and room-preview CAC lab
- `/artist-portal` - artist dashboard demo
- `/sales-portal` - outreach reply triage
- `/marketing-portal` - creative demand engine
