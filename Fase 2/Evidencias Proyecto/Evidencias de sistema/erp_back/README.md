# erp_back — NestJS + Prisma

Backend ERP v1 Enterprise (Almahue / Devint).

## Setup

```bash
npm install
cp .env.example .env   # define DATABASE_URL (PostgreSQL, schema erp)
npx prisma generate
npx prisma migrate deploy   # o: npx prisma migrate dev
npm run seed
npm run start:dev
```

`DATABASE_URL` es obligatorio para migrate/seed y arranque. Los unit tests (`npm test`) usan mocks de Prisma y **no** requieren BD.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run start:dev` | Desarrollo con hot reload |
| `npm run build` | Compilar a `dist/` |
| `npm run seed` | Datos demo (admin) |
| `npm test` | Unit tests (Jest, sin BD) |

## Demo login (post-seed)

- Email: `admin@almahue.local`
- Password: `Admin123!`

## Estructura

```
src/
  modules/     # Módulos de dominio (health, auth, comercial…)
  prisma/      # PrismaService global
prisma/
  schema.prisma
```
