// Reapunta CONTRATISTAS a la cuenta de gasto correcta y completa las
// dimensiones que exigen las cuentas mapeadas en EMP-EXPORT.
// El mapeo nació mal del seed: apuntaba a 5-1-01-01 VENTAS DE EXPLOTACIÓN,
// una cuenta de ingresos y además no imputable.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EMPRESA = 'EMP-EXPORT';
const CC_ADMIN = 'CC-EMP-EXPORT-119f087a-5189-4452-ac41-8a730e6fde62'; // 15100 ADMINISTRACION Y FINANZAS ALM
const AREA_PACK = 'AREA-EX-PACK'; // PACK Packing fruta export
const CTA_MO_CONTRATISTA = 'cmtal4x77005h64tyg3dyb03q'; // 6-1-01-01-002 MANO DE OBRA CONTRATISTA

const run = async () => {
  await prisma.configContableSii.update({
    where: {
      empresaId_tipoDocumentoSii: { empresaId: EMPRESA, tipoDocumentoSii: 'CONTRATISTAS' },
    },
    data: {
      nombre: 'Gasto MO contratistas',
      cuentaContableId: CTA_MO_CONTRATISTA,
      centroCostoId: CC_ADMIN,
      lado: 'DEBE',
    },
  });

  await prisma.configContableSii.update({
    where: {
      empresaId_tipoDocumentoSii: { empresaId: EMPRESA, tipoDocumentoSii: 'VENTAS' },
    },
    data: { centroCostoId: CC_ADMIN, areaNegocioId: AREA_PACK },
  });

  console.log('CONTRATISTAS y VENTAS actualizados');
};

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
