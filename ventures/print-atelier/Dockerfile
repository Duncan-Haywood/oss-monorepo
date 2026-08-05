# Container image for Print Atelier (Next.js standalone).
#
# platform/k8s/apps/print-atelier/ has had a Deployment, Service, Ingress, PDB
# and an ArgoCD Application pointing at
# git.marisstella.dev/giteaadmin/print-atelier:latest since they were written,
# and nothing in the repository could produce that image. This is the missing
# half. Modelled on ventures/local-site-studio/Dockerfile, which closed the same
# gap for that venture on 2026-08-04.
#
# Node 22 matches the repository .nvmrc and the version .gitea/workflows pin.
# Verified 2026-08-04 on 22.22.3: `npm ci` installs, `next build` exits 0, and
# .next/standalone/server.js serves "/" with HTTP 200.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Nothing here needs a lifecycle script to install; the build stage generates
# everything that is generated.
RUN npm ci --ignore-scripts --no-audit --fund=false

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js substitutes NEXT_PUBLIC_* at build time, so this is the only place the
# site's own origin can enter the image — a Deployment env entry for it would
# look like configuration and change nothing. That was the state until now, and
# platform/k8s/apps/print-atelier/SECRETS.md recorded it as open.
#
# There is deliberately no default. Before this arg existed the code carried
# `?? "https://printatelier.com"`, a domain that resolves to AWS registrar
# parking and that this portfolio does not deploy to (measured 2026-08-05, see
# ventures/print-atelier/tests/catalog-print-file-provenance.test.ts) — so every
# image published a sitemap, a robots.txt and an ad-platform product feed of
# URLs on a host we cannot serve. A default here would restore exactly that: an
# unset value would once again build into a plausible-looking wrong answer.
#
# Built unset, the image is intact but publishes nothing: robots.txt disallows
# crawling, sitemap.xml is empty, and /api/ad-catalog/sync answers 503. Set it
# to the origin the ingress actually serves, e.g.
#   docker build --build-arg NEXT_PUBLIC_SITE_URL=https://atelier.marisstella.dev .
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# `output: "standalone"` in next.config.mjs emits .next/standalone with its own
# pruned node_modules (37M against 519M installed), so the full tree is
# deliberately not copied here. This venture has no `public/` directory — unlike
# local-site-studio — so there is nothing to copy for it, and adding a COPY for
# one that does not exist would fail the build.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# The venture has no /api/health route, and the Deployment's own liveness and
# readiness probes use "/", so this checks the same path they do.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
