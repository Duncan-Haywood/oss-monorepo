# The hosted product: the paid API, the accountant workspace (/app) and the free pages, one
# process on one port (pro/serve.mjs). FSL-1.1-MIT (LICENSE, part 2). The MIT ./Dockerfile stays
# the self-hostable free edition.
#
# Build from the REPOSITORY ROOT (pro/ imports ../../../packages/billing/src, outside this app):
#   docker build -f apps/einvoice-preflight/Dockerfile.pro -t einvoice-pro .
# Dockerfile.pro.dockerignore keeps the context to this app and packages/billing.
# Run with one volume at /data (the SQLite file; docs/HOSTING.md):
#   docker run -p 8080:8080 -v einvoice-data:/data -e ADMIN_TOKEN=... einvoice-pro

# Stage 1 compiles the official EN 16931, XRechnung and Peppol BIS Schematron to SEF files.
FROM node:22-alpine AS schematron
RUN apk add --no-cache git curl unzip
WORKDIR /build
COPY apps/einvoice-preflight/build-schematron.mjs ./
RUN npm init -y >/dev/null && npm i saxon-js xslt3 slimdom fontoxpath && node build-schematron.mjs

FROM node:22-alpine
# node:sqlite (the store) needs Node 22.13+; .ts imports from packages/billing need type
# stripping, on by default from Node 22.18. Fail the build, not the first request.
RUN node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a===22 && b<18) { console.error("Node 22.18+ needed"); process.exit(1) }'
COPY packages/billing/src /srv/packages/billing/src
# pro/admin.mjs imports the platform-admin contract the same way.
COPY packages/admin-metrics/src /srv/packages/admin-metrics/src
RUN rm -f /srv/packages/billing/src/*.test.ts /srv/packages/admin-metrics/src/*.test.ts
WORKDIR /srv/apps/einvoice-preflight
COPY apps/einvoice-preflight/*.mjs apps/einvoice-preflight/index.html apps/einvoice-preflight/create.html ./
COPY apps/einvoice-preflight/pro ./pro
RUN rm -f *.test.mjs pro/*.test.mjs
COPY --from=schematron /build/schematron ./schematron
COPY --from=schematron /build/node_modules/saxon-js ./node_modules/saxon-js
# plain-JS rule runner: PINT (SG, A-NZ), ZATCA and national add-ons without Saxon files
COPY --from=schematron /build/node_modules/slimdom ./node_modules/slimdom
COPY --from=schematron /build/node_modules/fontoxpath ./node_modules/fontoxpath
COPY --from=schematron /build/node_modules/prsc ./node_modules/prsc
COPY --from=schematron /build/node_modules/whynot ./node_modules/whynot
COPY --from=schematron /build/node_modules/xspattern ./node_modules/xspattern
COPY apps/einvoice-preflight/plain ./plain
COPY apps/einvoice-preflight/fonts ./fonts
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
ENV PORT=8080 PRO_DB_FILE=/data/einvoice.db NODE_ENV=production
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "pro/serve.mjs"]
