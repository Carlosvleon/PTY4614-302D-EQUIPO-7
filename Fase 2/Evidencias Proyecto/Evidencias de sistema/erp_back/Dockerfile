# syntax=docker/dockerfile:1
# ERP Almahue — backend NestJS + Prisma (multi-stage)
#
# Build:  docker build -t almahue-erp-api:local .
# Run:    docker run --env-file .env -p 3001:3001 almahue-erp-api:local
#
# Migraciones: ver ERP/DEPLOY.md
#   - Por defecto NO se migran al arrancar.
#   - RUN_MIGRATE=true ejecuta `prisma migrate deploy` antes de start.

FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev \
  && npx prisma generate \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
