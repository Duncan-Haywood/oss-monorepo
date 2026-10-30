# Build from this directory: docker build -t sales-agent .
# (dockerfile.test.mjs fails if a module the server imports is not copied below)
FROM node:22-alpine
WORKDIR /app
COPY engine.mjs ai.mjs byok.mjs learn.mjs model.mjs research.mjs ./
COPY self-host/agent.mjs self-host/imap.mjs self-host/smtp.mjs self-host/oauth.mjs self-host/crm.mjs ./self-host/
RUN mkdir -p /data && chown node /data
USER node
ENV PORT=8787 HOST=0.0.0.0 DATA_DIR=/data
EXPOSE 8787
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "self-host/agent.mjs"]
