FROM node:22-alpine
WORKDIR /app
COPY cron.mjs monitor.mjs notify.mjs dashboard.mjs server.mjs ./
RUN mkdir /data && chown node /data
USER node
ENV PORT=8080 STATE=/data/state.json
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
