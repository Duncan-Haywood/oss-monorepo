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

# Next.js substitutes NEXT_PUBLIC_* into the bundle at `npm run build`, so these
# can only arrive here. A Deployment env entry for one of them would look like
# configuration and change nothing — which is why they are absent from
# platform/k8s/apps/local-site-studio/deployment.yaml and named in
# platform/k8s/deployment-env-coverage.yaml instead.
#
# Every ARG is declared WITHOUT a default, deliberately. An unpassed build arg
# becomes the empty string, and each of these has a readiness assessor that
# treats empty as unconfigured and refuses rather than guessing:
# NEXT_PUBLIC_APP_URL gates sendEmail (the CAN-SPAM unsubscribe link would be
# unreachable), NEXT_PUBLIC_PREVIEW_DOMAIN used to default to a domain
# registered to an unrelated third party, and NEXT_PUBLIC_PRODUCTION_DOMAIN
# gates DNS instructions in the go-live email. A plausible default here is the
# `?? "123 Market St"` defect with an image-sized blast radius.
#
# NEXT_PUBLIC_CONVEX_URL is the money-path one. Empty leaves convexClient null in
# src/lib/db.ts, so every write — including checkout_sessions and
# commerce_orders — falls back to SQLite at process.cwd()/local.db, which is
# container-local and lost on restart or rescale. The venture's own
# .env.example says it is "required before first paid order" on multi-instance.
# Nothing is defaulted here; supplying it is the operator action recorded in
# platform/k8s/apps/local-site-studio/SECRETS.md.
# Only NEXT_PUBLIC_APP_URL is declared here, and that is a deliberate limit.
# `platform/ci/test/build-arg-supply.test.mjs` requires every ARG a venture
# Dockerfile declares to be supplied by the workflow that builds the image, and
# to match the host the Ingress routes. An ARG nobody passes is an empty string
# that reads as configuration — decoration with a failure mode.
#
# The value below is not a guess: platform/k8s/apps/local-site-studio/ingress.yaml
# declares `studio.marisstella.dev`, and that control asserts the two agree.
#
# The venture reads twelve further NEXT_PUBLIC_* values (brand, legal entity,
# postal address, preview and production domains, support email, and Convex).
# They are deliberately NOT declared here, because no value for them exists in
# this repository and inventing one is the defect this venture has already
# shipped — NEXT_PUBLIC_PREVIEW_DOMAIN once defaulted to a domain registered to
# an unrelated third party. Each is itemised in
# platform/k8s/apps/local-site-studio/SECRETS.md; add the ARG and the matching
# --build-arg together, at the moment a real value exists.
#
# The money-path one is NEXT_PUBLIC_CONVEX_URL. Empty leaves convexClient null in
# src/lib/db.ts, so checkout_sessions and commerce_orders fall back to SQLite at
# process.cwd()/local.db — container-local, lost on restart or rescale. The
# venture's own .env.example calls it "required before first paid order" on
# multi-instance. It is a build-time value, so no Deployment change can supply
# it after the fact.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

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
