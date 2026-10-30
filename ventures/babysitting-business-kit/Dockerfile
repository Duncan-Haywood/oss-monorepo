FROM node:22-alpine
WORKDIR /app
COPY engine.mjs server.mjs usage.mjs index.html tabs.mjs sw.js manifest.webmanifest icon.svg icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png babysitting-taxes.html how-to-start-a-babysitting-business.html how-much-to-charge-for-babysitting.html babysitting-references.html ./
RUN mkdir /data && chown node /data
USER node
ENV PORT=8080 STATE=/data/desk.json
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
