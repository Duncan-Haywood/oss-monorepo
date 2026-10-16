# Zero-dependency image for the first-party counter (nothing to fetch at build time).
FROM node:22-alpine
WORKDIR /app
COPY counter.mjs ./
ENV PORT=8787 COUNTER_STORE=/data/counts.json
VOLUME /data
USER node
EXPOSE 8787
CMD ["node", "counter.mjs"]
