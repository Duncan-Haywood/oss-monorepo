# Container image for Local Site Studio (Next.js standalone).
#
# platform/k8s/apps/local-site-studio/ has had a Deployment, Service, Ingress
# and PDB pointing at git.marisstella.dev/giteaadmin/local-site-studio since it
# was written, and nothing in the repository could produce that image. This is
# the missing half.
#
# Node 22 is not a style choice. src/lib/db.ts imports `DatabaseSync` from
# `node:sqlite`, which does not exist before 22.5.0, so `next build` fails at
# "Collecting page data" on Node 20 — the version .nvmrc used to declare.
# Verified 2026-08-04: build fails on 20.20.2, succeeds on 22.22.3.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# No postinstall step needs to run to install dependencies; the build stage is
# what generates anything generated.
RUN npm ci --ignore-scripts --no-audit --fund=false

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# `output: "standalone"` in next.config.ts emits .next/standalone with its own
# pruned node_modules (50M against 554M installed), so the full tree is
# deliberately not copied here.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# The venture has no /api/health route, and the Deployment's own liveness and
# readiness probes use "/", so this checks the same path they do.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
