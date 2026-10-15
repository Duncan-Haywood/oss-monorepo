FROM node:22-alpine
WORKDIR /app
COPY engine.mjs sdk.mjs server.mjs ./
COPY examples ./examples
RUN mkdir -p /data && chown node /data
USER node
ENV PORT=8080 STATE=/data/flags.json TRUST_PROXY=true
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
