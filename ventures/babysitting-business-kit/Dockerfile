FROM node:22-alpine
WORKDIR /app
COPY engine.mjs server.mjs usage.mjs taxes.mjs index.html slots.mjs intake.mjs meet-and-greet.html references.mjs ./
RUN mkdir /data && chown node /data
USER node
ENV PORT=8080 STATE=/data/desk.json
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
