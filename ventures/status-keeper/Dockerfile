FROM node:22-alpine
WORKDIR /app
COPY monitor.mjs render.mjs subscribers.mjs server.mjs ./
USER node
ENV PORT=8080 STATE=/tmp/state.json
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
