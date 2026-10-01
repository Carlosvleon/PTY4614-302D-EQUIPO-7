# syntax=docker/dockerfile:1
# ERP Almahue — frontend Vite/React (build estático + nginx)
#
# Build-time (bake en el bundle):
#   VITE_API_URL   URL base de la API vista por el navegador
#                  - /api/v1  → mismo origen; nginx proxy a `api` (compose)
#                  - /almahue-erp/api/v1 → mismo origen bajo subpath (IP)
#                  - https://erp.ejemplo.com/api/v1 → API pública absoluta
#   VITE_BASE_PATH prefijo SPA (`/` o `/almahue-erp/`)
#   VITE_APP_TITLE título de la app
#
# Build (contexto = raíz ERP, porque el demo de flujo importa erp_back):
#   docker build -f erp_front/Dockerfile \
#     --build-arg VITE_API_URL=/api/v1 \
#     --build-arg VITE_BASE_PATH=/ \
#     -t almahue-erp-web:local .

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY erp_front/package.json erp_front/package-lock.json ./
RUN npm ci

COPY erp_front/index.html ./
COPY erp_front/tsconfig.json erp_front/tsconfig.app.json erp_front/tsconfig.node.json ./
COPY erp_front/vite.config.ts ./
COPY erp_front/public ./public
COPY erp_front/src ./src
# src/services/mock/flujo-excel-demo.ts sube cuatro niveles hasta erp_back/prisma.
COPY erp_back/prisma/flujo-excel-almahue.ts /erp_back/prisma/flujo-excel-almahue.ts

ARG VITE_API_URL=/api/v1
ARG VITE_BASE_PATH=/
ARG VITE_APP_TITLE="Almahue ERP v1"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH
ENV VITE_APP_TITLE=$VITE_APP_TITLE

RUN npx vite build

FROM nginx:1.27-alpine AS production
COPY erp_front/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
