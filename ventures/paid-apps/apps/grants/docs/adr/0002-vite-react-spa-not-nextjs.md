# ADR 0002: Vite + React SPA with a Hono API, not Next.js

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The owner asked: "Next.js + TS?" TypeScript, yes: the whole repo is strict TypeScript. This ADR answers
the Next.js part by starting from what the product needs.

- **Most of the product is an authenticated dashboard.** Only the landing page, login, sign-up, legal
  pages and invite acceptance are public. Every other page is behind a login, shows tenant data and has
  no SEO value.
- **Most of the work happens in the background.** Document processing and fact extraction run on a queue,
  the application pipeline is a durable workflow that can wait weeks for a reviewer, and discovery and
  follow-ups run on cron. Cloudflare provides all of these natively in the same Worker (ADR 0001).
- **Cost matters.** Prices are cost-plus (ADR 0007), so every server render and every extra service ends
  up in a nonprofit's bill.

Next.js mainly adds server rendering (SSR, SSG, ISR and React Server Components). That helps SEO and
first paint on public pages, which only the marketing pages need. Next.js has no queue, durable-workflow
or cron primitives. On Cloudflare it runs through the OpenNext adapter, and we would still need Worker
queue consumers, a Workflow class and a `scheduled` handler next to it. That means two programming
models and probably two deployables.

## Decision

- **UI:** a React 19 single-page app built by Vite, with TanStack Router (routes wired in code in
  `src/client/router.tsx`), TanStack Query and Tailwind 4.
- **API:** Hono in the same Worker at `/api/*`. Request and response types are shared through
  `src/shared` (zod contracts in `content.ts`, DTOs in `api/types.ts`, enums in `enums.ts`), so types
  hold from the database row to the React component.
- **Hosting:** Vite builds static assets that Workers static assets serves. The Worker runs only for
  `/api/*` (`run_worker_first`), so page loads do not run server code.
- **Dev loop:** `pnpm dev` starts Vite with `@cloudflare/vite-plugin`, which runs the Worker and the SPA
  together in workerd.

## Consequences

- One runtime for the API, jobs and pipeline, and one language and type system end to end.
- Hosting stays cheap: no server rendering per page view, and static assets cost almost nothing.
- Public pages render on the client, so SEO and first paint on `/` are weaker. That is acceptable for a
  handful of public pages.
- There is no file-based routing. Routes are added to `router.tsx` by hand. We chose this on purpose so
  modules could be built in parallel without a generated route tree.
- We own data-loading patterns. We use TanStack Query with one `queries.ts` per UI area.

**Revisit if** we need many SEO pages, for example a public funder directory, grant guides or a blog.
Then add a **separate marketing site** (static site generator, Astro or Next.js, deployed separately on
the apex domain). Keep the app as an SPA. Do not migrate the app.

## Alternatives considered

- **Next.js on Cloudflare via OpenNext.** Server rendering we don't need, a second model next to the
  queue, workflow and cron handlers, and more cost per request.
- **Next.js on Vercel, with jobs on Inngest, Trigger.dev or QStash.** Two or three vendors, data moving
  between clouds, and per-seat and per-step pricing.
- **React Router 7 or Remix framework mode on Workers.** Runs on Workers natively, but it is still SSR we
  don't need. It is a reasonable choice later if some pages ever need server rendering.
- **Astro for everything.** Very good for content sites, but our app is a stateful dashboard.
