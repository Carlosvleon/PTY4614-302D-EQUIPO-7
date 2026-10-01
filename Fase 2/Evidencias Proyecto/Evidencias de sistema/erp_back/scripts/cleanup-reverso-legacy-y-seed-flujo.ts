/**
 * 1) Elimina basura del reverso antiguo (NC-*-REV, *-R, ANULADO con folioReversador, etc.)
 * 2) Siembra facturas CONTABILIZADAS listas para probar reverso contable nuevo (V2).
 *
 * Uso: npx ts-node -r tsconfig-paths/register scripts/cleanup-reverso-legacy-y-seed-flujo.ts
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function isLegacyBasura(d: {
  folio: string;
  tipo: string;
  estado: string;
  fromReversa: boolean;
  folioReversador: string | null;
  folioOrigen: string | null;
}): boolean {
  if (/-REV$/i.test(d.folio)) return true;
  if (/^NC-.*-REV/i.test(d.folio)) return true;
  if (/-R$/i.test(d.folio) && d.fromReversa) return true;
  if (d.estado === 'ANULADO' && d.folioReversador) return true;
  if (d.tipo === 'NC' && d.fromReversa && d.folioOrigen) return true;
  return false;
}

async function main() {
  const all = await prisma.documentoComercial.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  console.log(`Documentos actuales: ${all.length}`);

  const basura = all.filter(isLegacyBasura);
  const basuraIds = new Set(basura.map((d) => d.id));

  // También docs origen anulados cuyo folioReversador apunta a basura
  for (const d of all) {
    if (d.estado === 'ANULADO' && d.folioReversador && /REV/i.test(d.folioReversador)) {
      basuraIds.add(d.id);
    }
  }

  // Hijos NC que apuntan a docs basura
  for (const d of all) {
    if (d.documentoOrigenId && basuraIds.has(d.documentoOrigenId)) {
      basuraIds.add(d.id);
    }
  }

  const toDelete = all.filter((d) => basuraIds.has(d.id));
  console.log(`Basura a eliminar: ${toDelete.length}`);
  for (const d of toDelete) {
    console.log(`  - ${d.folio} · ${d.tipo} · ${d.estado} · fromReversa=${d.fromReversa}`);
  }

  // Romper FKs documentoOrigenId → basura antes de borrar
  if (toDelete.length) {
    await prisma.documentoComercial.updateMany({
      where: { documentoOrigenId: { in: [...basuraIds] } },
      data: { documentoOrigenId: null },
    });
    const del = await prisma.documentoComercial.deleteMany({
      where: { id: { in: [...basuraIds] } },
    });
    console.log(`Eliminados: ${del.count}`);
  }

  // Limpiar asientos huérfanos de reversas demo (origen REVERSA: / DOC-NEW: de pruebas)
  const asientosLegacy = await prisma.asiento.findMany({
    where: {
      OR: [
        { origen: { startsWith: 'REVERSA:' } },
        { origen: { startsWith: 'DOC-NEW:' } },
        { glosa: { contains: 'Reversa doc' } },
        { glosa: { contains: 'Nuevo asiento post-reversa' } },
        { glosa: { contains: 'Asiento original doc' } },
      ],
    },
    select: { id: true, numero: true, origen: true, glosa: true },
  });
  if (asientosLegacy.length) {
    const delA = await prisma.asiento.deleteMany({
      where: { id: { in: asientosLegacy.map((a) => a.id) } },
    });
    console.log(`Asientos legacy eliminados: ${delA.count}`);
    for (const a of asientosLegacy.slice(0, 20)) {
      console.log(`  - Asi.${a.numero} · ${a.origen ?? a.glosa}`);
    }
  }

  // Empresa + cliente + cuentas + CC
  const empresa = await prisma.empresa.findFirst({
    where: { OR: [{ id: 'EMP-1' }, { rut: { contains: '76' } }] },
    orderBy: { createdAt: 'asc' },
  });
  if (!empresa) throw new Error('No hay empresa para seed');

  const cliente = await prisma.cliente.findFirst({
    where: { empresaId: empresa.id, activo: true },
    orderBy: { razonSocial: 'asc' },
  });
  if (!cliente) throw new Error(`No hay cliente en ${empresa.id}`);

  const cuentas = await prisma.cuentaContable.findMany({
    where: { empresaId: empresa.id, activa: true, noImputable: false },
    orderBy: { codigo: 'asc' },
    take: 8,
  });
  const ccs = await prisma.centroCosto.findMany({
    where: { empresaId: empresa.id, activa: true },
    orderBy: { codigo: 'asc' },
    take: 4,
  });
  if (cuentas.length < 2) throw new Error('Se necesitan ≥2 cuentas imputables');
  if (!ccs.length) throw new Error('Se necesita ≥1 centro de costo');

  const ctaClientes = cuentas[0];
  const ctaVentaA = cuentas[1];
  const ctaVentaB = cuentas[2] ?? cuentas[1];
  const ccA = ccs[0];
  const ccB = ccs[1] ?? ccs[0];

  const casos = [
    {
      folio: 'FAC-QA-REV-001',
      neto: 1_500_000,
      lineas: [
        {
          descripcion: 'Venta exportación cereza (línea A)',
          cantidad: 1,
          precioUnitario: 900_000,
          descuentoPct: 0,
          total: 900_000,
          cuentaContableId: ctaVentaA.id,
          centroCostoId: ccA.id,
        },
        {
          descripcion: 'Venta packing ciruela (línea B)',
          cantidad: 1,
          precioUnitario: 600_000,
          descuentoPct: 0,
          total: 600_000,
          cuentaContableId: ctaVentaB.id,
          centroCostoId: ccB.id,
        },
      ],
    },
    {
      folio: 'FAC-QA-REV-002',
      neto: 750_000,
      lineas: [
        {
          descripcion: 'Venta nacional uva (homogénea)',
          cantidad: 3,
          precioUnitario: 250_000,
          descuentoPct: 0,
          total: 750_000,
          cuentaContableId: ctaVentaA.id,
          centroCostoId: ccA.id,
        },
      ],
    },
  ] as const;

  for (const caso of casos) {
    // Borrar si ya existía de un seed previo (doc + asientos QA / cadena)
    const prev = await prisma.documentoComercial.findFirst({
      where: { empresaId: empresa.id, folio: caso.folio },
    });
    if (prev) {
      const nums = [prev.asientoOriginal, prev.asientoReversador, prev.asientoNuevo, `QA-${caso.folio}`]
        .filter(Boolean) as string[];
      if (nums.length) {
        await prisma.asiento.deleteMany({
          where: { empresaId: empresa.id, numero: { in: nums } },
        });
      }
      await prisma.documentoComercial.delete({ where: { id: prev.id } });
    }
    await prisma.asiento.deleteMany({
      where: { empresaId: empresa.id, numero: `QA-${caso.folio}` },
    });

    const asiento = await prisma.asiento.create({
      data: {
        numero: `QA-${caso.folio}`,
        empresaId: empresa.id,
        periodo: '2026-08',
        fecha: new Date('2026-08-03'),
        tipo: 'VENTA',
        glosa: `Venta ${caso.folio} (seed QA reverso)`,
        debe: caso.neto,
        haber: caso.neto,
        estado: 'CONTABILIZADO',
        origen: `DOC:${caso.folio}`,
        lineas: [
          {
            debe: caso.neto,
            haber: 0,
            cuentaId: ctaClientes.id,
            glosa: 'Clientes',
          },
          ...caso.lineas.map((l) => ({
            debe: 0,
            haber: l.total,
            cuentaId: l.cuentaContableId,
            glosa: `${l.descripcion} · CC ${l.centroCostoId === ccA.id ? ccA.codigo : ccB.codigo}`,
          })),
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.documentoComercial.create({
      data: {
        folio: caso.folio,
        tipo: 'FACTURA',
        cliente: cliente.razonSocial,
        clienteId: cliente.id,
        fecha: new Date('2026-08-03'),
        neto: caso.neto,
        lineas: caso.lineas as unknown as Prisma.InputJsonValue,
        estado: 'CONTABILIZADA',
        fromReversa: false,
        asientoOriginal: asiento.numero,
        asientoReversador: null,
        asientoNuevo: null,
        folioReversador: null,
        folioOrigen: null,
        documentoOrigenId: null,
        formaPago: 'CREDITO',
        indicadorVenta: 'VENTA',
        descuentoGlobalPct: 0,
        cuentaContableId: ctaVentaA.id,
        centroCostoId: ccA.id,
        receptorRut: cliente.rut,
        receptorGiro: 'Agrícola / comercio',
        receptorDireccion: 'Camino Almahue s/n',
        receptorComuna: 'Pichidegua',
        receptorCiudad: 'Pichidegua',
        empresaId: empresa.id,
      },
    });
    console.log(`Seed OK: ${caso.folio} · Asi.${asiento.numero} · neto ${caso.neto}`);
  }

  const restantes = await prisma.documentoComercial.findMany({
    where: { empresaId: empresa.id },
    orderBy: { folio: 'asc' },
    select: { folio: true, tipo: true, estado: true, fromReversa: true, asientoOriginal: true },
  });
  console.log('\nDocumentos empresa tras limpieza/seed:');
  for (const d of restantes) {
    console.log(`  ${d.folio} · ${d.tipo} · ${d.estado} · asi=${d.asientoOriginal ?? '—'} · rev=${d.fromReversa}`);
  }
  console.log(`\nEmpresa=${empresa.id} · Cliente=${cliente.razonSocial}`);
  console.log('Prueba: Libro ventas → FAC-QA-REV-001/002 → Reverso contable → corregir cuenta/CC → Re-contabilizar');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
