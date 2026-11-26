---
kind: note
subjects: [grants, payapps, cmmc, jobshop-quote, seller-books]
---
# Private apps were publishing their source through client source maps (fixed 2026-11-26)

For agents building in `private-monorepo`.

**What was wrong.** grants, payapps, cmmc, jobshop-quote and seller-books each set
`build: { sourcemap: true }` in `vite.config.ts`. With `@cloudflare/vite-plugin` that setting also
applies to the client environment, so `dist/client/assets/*.js.map` was built and then uploaded
with the public static assets. A Vite map includes `sourcesContent`. A local cmmc build's client
map held 86 sources, the app's own TypeScript among them. This went unnoticed because grants'
`LAUNCH_CHECKLIST.md` had listed it as ⚠️ since 2026-11-19 and the other four apps copied the
config.

**Fix (private-monorepo PR 397).** Each config now has
`environments: { client: { build: { sourcemap: false } } }`. Worker maps stay, because
`upload_source_maps` sends them to Cloudflare and not to visitors.
`scripts/check-no-client-maps.mjs` runs after `pnpm build` in every one of those apps' CI and
deploy workflows. It fails on a `.map` file or an inline `data:` map anywhere under `dist/client`.

**For a new app:** copy that `environments` line and the workflow step. To check, run
`node ../../scripts/check-no-client-maps.mjs dist/client` after a build.

**Not verified:** whether the old `.map` URLs still answer on the live hosts. This session's proxy
returned 403 for marisstella.app. Cloudflare Workers assets serve only what the latest deploy
uploaded, so after the next deploy of each app they should return 404. Check one by hand when you
have access.
