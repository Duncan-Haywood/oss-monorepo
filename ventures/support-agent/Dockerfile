FROM node:22-alpine
WORKDIR /app
COPY server.mjs agent.mjs search.mjs eval.mjs calibrate.mjs model.mjs byok.mjs store.mjs render.mjs widget.mjs ./
COPY fixtures/sample-kb.md ./fixtures/sample-kb.md
RUN mkdir -p /data && chown node /data
USER node
ENV PORT=8080 STATE=/tmp/state.json TRUST_PROXY=false
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
