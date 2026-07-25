# syntax=docker/dockerfile:1

# ---- Stufe 1: Bundle bauen -------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Erst die Manifeste kopieren, damit npm ci nur bei Abhängigkeitsänderungen läuft.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# ---- Stufe 2: statisch ausliefern ------------------------------------------
FROM nginx:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="The Impossible Game" \
      org.opencontainers.image.description="Browser-Remake von World's Hardest Game" \
      org.opencontainers.image.licenses="MIT"

RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/game.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
