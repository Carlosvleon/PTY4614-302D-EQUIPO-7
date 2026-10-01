/**
 * Casos demo libro compras: 1, 2 y 3 OC asociadas al mismo nº de factura
 * (un RegistroCompra por OC; mismo `factura` = N:1 visual).
 *
 * Uso: npx ts-node -r tsconfig-paths/register scripts/seed-casos-oc-factura.ts
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const EMP = 'EMP-1';
const PROV_ID = 'PROV-SEED-1';
const PROV = 'Agro Insumos Sur';

type Caso = {
  factura: string;
  ocs: Array<{ numero: string; neto: number; desc: string }>;
};

const CASOS: Caso[] = [
  {
    factura: 'FAC-QA-1OC-001',
    ocs: [{ numero: 'OC-QA-FAC1-01', neto: 120_000, desc: 'Fertilizante NPK (caso 1 OC)' }],
  },
  {
    factura: 'FAC-QA-2OC-001',
    ocs: [
      { numero: 'OC-QA-FAC2-01', neto: 80_000, desc: 'Cajas cartón (caso 2 OC · parte 1)' },
      { numero: 'OC-QA-FAC2-02', neto: 95_000, desc: 'Cintas packing (caso 2 OC · parte 2)' },
    ],
  },
  {
    factura: 'FAC-QA-3OC-001',
    ocs: [
      { numero: 'OC-QA-FAC3-01', neto: 50_000, desc: 'Guantes (caso 3 OC · parte 1)' },
      { numero: 'OC-QA-FAC3-02', neto: 70_000, desc: 'Tijeras poda (caso 3 OC · parte 2)' },
      { numero: 'OC-QA-FAC3-03', neto: 110_000, desc: 'Malla antihelada (caso 3 OC · parte 3)' },
    ],
  },
];

async function upsertOc(numero: string, neto: number, desc: string) {
  const lineas = [
    { descripcion: desc, cantidad: 1, precioUnitario: neto, total: neto },
  ] as unknown as Prisma.InputJsonValue;

  const existing = await prisma.ordenCompra.findFirst({
    where: { empresaId: EMP, numero },
  });
  if (existing) {
    return prisma.ordenCompra.update({
      where: { id: existing.id },
      data: {
        estado: 'RECEPCIONADA',
        neto,
        proveedor: PROV,
        proveedorId: PROV_ID,
        lineas,
      },
    });
  }
  return prisma.ordenCompra.create({
    data: {
      numero,
      fecha: new Date(),
      proveedor: PROV,
      proveedorId: PROV_ID,
      solicitante: 'QA Seed',
      moneda: 'CLP',
      neto,
      afacto: 'AFECTO',
      estado: 'RECEPCIONADA',
      departamento: 'Compras',
      lineas,
      empresaId: EMP,
    },
  });
}

async function upsertRegistro(oc: { id: string; numero: string; neto: Prisma.Decimal | number }, factura: string) {
  const monto = Number(oc.neto);
  const existing = await prisma.registroCompra.findFirst({
    where: { empresaId: EMP, ocNumero: oc.numero, factura },
  });
  const data = {
    ocId: oc.id,
    ocNumero: oc.numero,
    factura,
    proveedorOc: PROV,
    proveedorFactura: PROV,
    proveedorId: PROV_ID,
    monto,
    afactoOc: 'AFECTO' as const,
    afactoFactura: 'AFECTO' as const,
    afactoOk: true,
    estado: 'CONTABILIZADA' as const,
    lineas: [
      {
        descripcion: `Ítem factura ${factura} / ${oc.numero}`,
        cantidad: 1,
        precioUnitario: monto,
        total: monto,
      },
    ] as unknown as Prisma.InputJsonValue,
  };
  if (existing) {
    return prisma.registroCompra.update({ where: { id: existing.id }, data });
  }
  return prisma.registroCompra.create({
    data: { ...data, empresaId: EMP },
  });
}

async function main() {
  const prov = await prisma.proveedor.findFirst({ where: { id: PROV_ID, empresaId: EMP } });
  if (!prov) throw new Error(`Proveedor ${PROV_ID} no existe en ${EMP}`);

  console.log('Seed casos OC↔factura (1 / 2 / 3 OC por factura)…');
  for (const caso of CASOS) {
    const n = caso.ocs.length;
    console.log(`\n▸ ${caso.factura} ← ${n} OC`);
    for (const o of caso.ocs) {
      const oc = await upsertOc(o.numero, o.neto, o.desc);
      const reg = await upsertRegistro(oc, caso.factura);
      console.log(`  ${oc.numero} (${oc.estado}) → reg ${reg.id.slice(0, 8)}… $${Number(reg.monto)}`);
    }
  }

  const resumen = await prisma.registroCompra.groupBy({
    by: ['factura'],
    where: {
      empresaId: EMP,
      factura: { in: CASOS.map((c) => c.factura) },
    },
    _count: { _all: true },
    _sum: { monto: true },
  });
  console.log('\nResumen:');
  for (const r of resumen.sort((a, b) => a.factura.localeCompare(b.factura))) {
    console.log(
      `  ${r.factura}: ${r._count._all} fila(s) · total $${Number(r._sum.monto ?? 0)}`,
    );
  }
  console.log('\nListo. Recarga Libro de compras y filtra FAC-QA-1OC / FAC-QA-2OC / FAC-QA-3OC.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
