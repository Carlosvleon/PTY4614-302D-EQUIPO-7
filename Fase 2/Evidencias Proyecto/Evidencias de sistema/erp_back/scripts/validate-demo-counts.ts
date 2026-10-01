import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const EMP = 'EMP-1';

async function group(model: keyof PrismaClient, where: object) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma as any)[model].groupBy({ by: ['estado'], where, _count: true });
  return rows.map((r: { estado: string; _count: number }) => `${r.estado}:${r._count}`).join(', ') || '(vacio)';
}

async function main() {
  const pin = await prisma.usuario.findFirst({ where: { id: 'U-1' }, select: { pinAprobacionHash: true } });
  const wf = await prisma.workflowConfig.findMany({ where: { empresaId: EMP }, select: { modulo: true } });
  const out = {
    pin: Boolean(pin?.pinAprobacionHash),
    wf: wf.map((w) => w.modulo),
    cot: await group('documentoComercial', { empresaId: EMP, tipo: 'COTIZACION' }),
    np: await group('documentoComercial', { empresaId: EMP, tipo: 'NP' }),
    fac: await group('documentoComercial', { empresaId: EMP, tipo: { in: ['FACTURA', 'NC'] } }),
    oc: await group('ordenCompra', { empresaId: EMP }),
    aprob: await group('aprobacionOc', { empresaId: EMP }),
    rec: await group('recepcionOc', { empresaId: EMP }),
    reg: await group('registroCompra', { empresaId: EMP }),
    prf: await group('proformaContratista', { empresaId: EMP }),
    ild: await group('ingresoLaborDiario', { empresaId: EMP }),
    asi: await group('asiento', { empresaId: EMP }),
    pros: await prisma.prospecto.count({ where: { empresaId: EMP } }),
    pagos: await prisma.pago.count({ where: { empresaId: EMP } }),
    cc: await prisma.cuentaCorrienteMovimiento.count({ where: { empresaId: EMP } }),
    per: await prisma.periodoContable.findMany({
      where: { empresaId: EMP },
      select: { codigo: true, estado: true, activo: true },
    }),
  };
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
