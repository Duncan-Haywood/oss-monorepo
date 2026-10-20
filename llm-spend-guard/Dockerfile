# Minimal image for the proxy. No dependencies to install: the source is the app.
FROM node:22-alpine
WORKDIR /app
COPY guard.mjs providers.mjs proxy.mjs simulate.mjs store-file.mjs cli.mjs LICENSE ./
USER node
WORKDIR /data
EXPOSE 8787
# Mount a directory with guard-policy.json at /data; state is written beside it.
CMD ["node", "/app/cli.mjs", "proxy", "/data/guard-policy.json", "--host", "0.0.0.0", "--port", "8787", "--state", "/data/guard-state.json"]
