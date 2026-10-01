// Estado de los mapeos Config SII: cuenta destino, dimensiones exigidas y dimensiones cargadas.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const run = async () => {
  const rows = await prisma.configContableSii.findMany({
    include: {
      cuentaContable: {
        select: {
          codigo: true,
          nombre: true,
          activa: true,
          noImputable: true,
          requiereCc: true,
          requiereArea: true,
          requiereElemento: true,
        },
      },
    },
    orderBy: [{ empresaId: 'asc' }, { tipoDocumentoSii: 'asc' }],
  });

  for (const r of rows) {
    const c = r.cuentaContable;
    const exige = [
      c.requiereCc && 'CC',
      c.requiereArea && 'AREA',
      c.requiereElemento && 'EC',
    ].filter(Boolean);
    const tiene = [
      r.centroCostoId && 'CC',
      r.areaNegocioId && 'AREA',
      r.elementoCostoId && 'EC',
    ].filter(Boolean);
    const faltan = exige.filter((d) => !tiene.includes(d));
    const flag = faltan.length ? `FALTA ${faltan.join('+')}` : 'OK';
    const salud = !c.activa ? ' [INACTIVA]' : c.noImputable ? ' [NO IMPUTABLE]' : '';
    console.log(
      `${flag.padEnd(16)} ${r.tipoDocumentoSii.padEnd(14)} ${c.codigo.padEnd(14)} ${c.nombre}`
      + `${salud}${exige.length ? ` · exige ${exige.join('+')}` : ''}`,
    );
  }
};

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
