# erp_front — Vite + React + Tailwind

Frontend ERP v1 Enterprise (Almahue / Devint).

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

App: http://localhost:5174  
Proxy API → http://localhost:3001 (`/api/*`)

## Variables (.env)

| Variable | Descripción |
|----------|-------------|
| `VITE_DEV_API_PROXY` | URL backend en desarrollo |
| `VITE_API_BASE` | Prefijo API (`/api/v1`) |

## Estructura

```
src/
  app/       # Layout shell
  pages/     # Pantallas
  lib/       # API client
  hooks/     # React Query
```
