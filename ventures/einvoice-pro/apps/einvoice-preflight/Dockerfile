# Stage 1 compiles the official EN 16931, XRechnung and Peppol BIS Schematron
# to SEF files (build-schematron.mjs). Stage 2 is the small runtime image.
FROM node:22-alpine AS schematron
RUN apk add --no-cache git curl unzip
WORKDIR /build
COPY build-schematron.mjs ./
RUN npm init -y >/dev/null && npm i saxon-js xslt3 slimdom fontoxpath && node build-schematron.mjs

FROM node:22-alpine
# The runtime needs only node: drop the package managers the base image ships, and their bundled
# dependencies with them (trivy flags several; platform/security/baseline.yaml).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
COPY *.mjs index.html create.html ./
RUN rm -f *.test.mjs
COPY --from=schematron /build/schematron ./schematron
COPY --from=schematron /build/node_modules/saxon-js ./node_modules/saxon-js
# plain-JS rule runner: PINT (SG, A-NZ), ZATCA and national add-ons without Saxon files
COPY --from=schematron /build/node_modules/slimdom ./node_modules/slimdom
COPY --from=schematron /build/node_modules/fontoxpath ./node_modules/fontoxpath
COPY --from=schematron /build/node_modules/prsc ./node_modules/prsc
COPY --from=schematron /build/node_modules/whynot ./node_modules/whynot
COPY --from=schematron /build/node_modules/xspattern ./node_modules/xspattern
COPY plain ./plain
COPY fonts ./fonts
USER node
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
