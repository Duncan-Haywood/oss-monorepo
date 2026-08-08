# Container image for AI Engineering Academy.
#
# Builds the static HTML documentation and interactive sandbox pages using
# Node 22 and serves them via nginx.
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies for site build
COPY site/package.json site/package-lock.json ./site/
RUN cd site && npm ci --ignore-scripts --no-audit --fund=false

# Copy full venture source and build static site
COPY . .
RUN npm --prefix site test && npm --prefix site run build

FROM nginx:alpine AS runner

COPY --from=builder /app/ventures/ai-engineering-academy/site/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
