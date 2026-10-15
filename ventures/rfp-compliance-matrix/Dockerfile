FROM node:22-alpine
WORKDIR /app
COPY extract.mjs shred.mjs llm.mjs server.mjs sample.mjs usage.mjs index.html LICENSE ./
USER node
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
