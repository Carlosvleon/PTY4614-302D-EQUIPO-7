/**
 * Reset BD local: solo superadmin + empresa bootstrap (sin seed demo).
 * Uso: cd ERP/erp_back && npm run reset:superadmin
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function main() {
  console.log('[reset] Truncando schema erp (CASCADE)…');
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'erp' ORDER BY tablename
  `;
  if (tables.length) {
    const list = tables.map((t) => `"erp"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  console.log('[reset] Bootstrap mínimo: ROL-1, EMP-BOOT, U-1');
  await prisma.rol.create({
    data: {
      id: 'ROL-1',
      codigo: 'SUPERADMIN',
      nombre: 'Administrador',
      permisos: ['*'],
      aprobarConPin: true,
    },
  });

  await prisma.empresa.create({
    data: {
      id: 'EMP-BOOT',
      rut: '76.000.000-0',
      razonSocial: 'Bootstrap QA',
      giro: 'Solo superadmin E2E',
      activa: true,
    },
  });

  const passwordHash = await hash('Admin123!');
  const pinHash = await hash('4821');
  await prisma.usuario.create({
    data: {
      id: 'U-1',
      nombre: 'Admin Almahue',
      email: 'admin@almahue.local',
      username: 'AADMIN',
      passwordHash,
      pinAprobacionHash: pinHash,
      rolId: 'ROL-1',
      empresaId: 'EMP-BOOT',
      activo: true,
    },
  });

  await prisma.usuarioEmpresa.create({
    data: { usuarioId: 'U-1', empresaId: 'EMP-BOOT' },
  });

  const counts = {
    roles: await prisma.rol.count(),
    empresas: await prisma.empresa.count(),
    usuarios: await prisma.usuario.count(),
  };
  console.log('[reset] OK', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
