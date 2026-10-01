# syntax=docker/dockerfile:1
# billing-gateway — Nest + SQLite (node:sqlite). Node 22+ requerido.
#
# Una instancia. El store vive en /app/data (volumen).
# tenants.local.json se monta en runtime; no va en la imagen.
# Bind 0.0.0.0 solo dentro del contenedor; el compose publica 127.0.0.1.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3040
ENV BILLING_BIND_HOST=0.0.0.0
ENV BILLING_STORE_PATH=/app/data/emissions.sqlite

RUN mkdir -p /app/data && chown node:node /app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3040
CMD ["node", "dist/main.js"]
