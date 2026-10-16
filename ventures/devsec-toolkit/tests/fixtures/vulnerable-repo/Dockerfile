FROM node:14
ARG DB_PASSWORD=changeme-demo-only
ENV API_SECRET=demo-not-a-real-secret
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "src/server.js"]
