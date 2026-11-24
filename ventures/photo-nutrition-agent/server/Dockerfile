FROM node:22-slim
WORKDIR /app
COPY *.mjs package.json ./
ENV NODE_ENV=production DATABASE_PATH=/app/data/nutrition.sqlite PORT=8787
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 8787
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
