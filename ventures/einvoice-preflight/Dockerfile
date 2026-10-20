# Stage 1 compiles the official EN 16931 + XRechnung/Peppol Schematron to SEF files
# (needs network at build time only). Stage 2 is the small runtime image.
FROM node:22-alpine AS schematron
RUN apk add --no-cache git unzip
WORKDIR /build
COPY build-schematron.mjs ./
RUN npm init -y >/dev/null && npm i saxon-js xslt3 && node build-schematron.mjs

FROM node:22-alpine
WORKDIR /app
COPY *.mjs index.html create.html ./
RUN rm -f *.test.mjs
COPY --from=schematron /build/schematron ./schematron
# Saxon-JS (Saxonica, free to use, not MIT) is the only runtime dependency; it pulls in axios.
RUN npm i --omit=dev --no-save --no-package-lock saxon-js && npm cache clean --force
USER node
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
