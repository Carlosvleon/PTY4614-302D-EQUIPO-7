/**
 * Seed demo con datos reales MJ (pack mj-compartidos-2026-07-30).
 *
 * Limpia datos operativos de EMP-1 y carga maestros + golden paths desde Excel.
 * Requiere seed base previo (usuarios, roles, plan de cuentas):
 *   npm run seed
 *   npm run seed:demo-real
 */
import 'dotenv/config';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as XLSX from 'xlsx';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EMP = 'EMP-1';
const MJ_DIR = resolve(
  __dirname,
  '../../../docs/erp-planificacion/agrosoft-levantamiento/fuentes/mj-compartidos-2026-07-30',
);

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

// Bodegas AlmaWeb → nombres operativos (ReportePorTipomovExcel)
const BODEGA_ALMAWEB: Record<string, { codigo: string; nombre: string }> = {
  '2': { codigo: 'PACK-02', nombre: 'Packing Central' },
  '4': { codigo: 'PACK-04', nombre: 'Packing General' },
  '8': { codigo: 'PACK-PREM', nombre: 'Packing Premium' },
  '14': { codigo: 'MAT-14', nombre: 'Materiales Packing' },
  '22': { codigo: 'DESP-EXP', nombre: 'Despacho Exportación' },
  '23': { codigo: 'FRIG', nombre: 'Frigorífico' },
  '3': { codigo: 'BOD-03', nombre: 'Bodega Auxiliar 3' },
  '13': { codigo: 'BOD-13', nombre: 'Bodega Auxiliar 13' },
};

type InsumoSeed = {
  codigo: string;
  nombre: string;
  familia: string;
  subfamilia: string;
  unidad: string;
  costoPromedio: number;
  stockByBodega: Map<string, number>;
};

type ContraparteSeed = {
  id: string;
  rut: string;
  razonSocial: string;
  giro: string;
  tipo?: 'CLIENTE' | 'PROVEEDOR';
  tipoCliente?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  telefono?: string;
  email?: string;
  vendedor?: string;
};

function familiaFromCodigo(codigo: string): { familia: string; subfamilia: string } {
  const p = codigo.slice(0, 4);
  const map: Record<string, [string, string]> = {
    '0201': ['Embalaje', 'Absorbentes'],
    '0202': ['Embalaje', 'Bolsas'],
    '0204': ['Embalaje', 'Etiquetas y ventanas'],
    '0205': ['Embalaje', 'Cajas y maletas'],
    '0206': ['Embalaje', 'Protección y airbags'],
    '0208': ['Logística', 'Pallets y zunchos'],
    '0300': ['Fruta', 'Exportación'],
    '0399': ['Servicios', 'Fletes'],
  };
  const hit = map[p] ?? ['Insumos', 'General'];
  return { familia: hit[0], subfamilia: hit[1] };
}

function unidadFromNombre(nombre: string, codigo: string): string {
  const n = nombre.toUpperCase();
  if (codigo.startsWith('03') || /\bKG\b|\bKGS\b|\bCAJA\b|\bMALETA\b/.test(n)) return 'CAJ';
  if (/\bPALLET\b|\bPARRILLA\b|\bAIRBAG\b/.test(n)) return 'UN';
  if (/\bZUNCHO\b|\bBUFANDA\b|\bMETRO\b/.test(n)) return 'UN';
  return 'UN';
}

function linea(
  desc: string,
  qty: number,
  precio: number,
  extra: Record<string, unknown> = {},
) {
  return {
    descripcion: desc,
    cantidad: qty,
    precioUnitario: precio,
    descuentoPct: 0,
    total: qty * precio,
    ...extra,
  };
}

function readMjWorkbook(fileName: string): XLSX.WorkBook | null {
  const path = join(MJ_DIR, fileName);
  if (!existsSync(path)) {
    console.warn(`  [demo-real] Excel no encontrado: ${path}`);
    return null;
  }
  return XLSX.readFile(path);
}

/** Extrae insumos únicos del ReportePorTipomovExcel (ALM SERVICES SPA). */
function loadInsumosFromMovExcel(limit = 18): InsumoSeed[] {
  const wb = readMjWorkbook('ReportePorTipomovExcel_(7).xlsx');
  const map = new Map<string, InsumoSeed>();
  if (wb) {
    const sheet = wb.Sheets['ReportePorTipomovExcel'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    for (const r of rows.slice(2)) {
      const codigo = String(r[2] ?? '').trim();
      const nombre = String(r[3] ?? '').trim();
      if (!codigo || codigo === 'Articulo') continue;
      const bodega = String(r[8] ?? '').trim();
      const qty = Number(r[9]) || 0;
      const price = Number(r[10]) || 0;
      const { familia, subfamilia } = familiaFromCodigo(codigo);
      if (!map.has(codigo)) {
        map.set(codigo, {
          codigo,
          nombre,
          familia,
          subfamilia,
          unidad: unidadFromNombre(nombre, codigo),
          costoPromedio: price,
          stockByBodega: new Map(),
        });
      }
      const row = map.get(codigo)!;
      if (price > 0) row.costoPromedio = price;
      if (bodega && qty > 0) {
        row.stockByBodega.set(bodega, (row.stockByBodega.get(bodega) ?? 0) + qty);
      }
    }
  }

  // Fruta exportación y flete (manual COMEX + cartola Almahue USD)
  const extras: InsumoSeed[] = [
    {
      codigo: '00000003',
      nombre: 'CEREZA 5 KG EXPORT',
      familia: 'Fruta',
      subfamilia: 'Cereza',
      unidad: 'CAJ',
      costoPromedio: 18500,
      stockByBodega: new Map([['23', 2400], ['22', 800]]),
    },
    {
      codigo: '00000026',
      nombre: 'NECTARINA EXPORT 2,5 KG',
      familia: 'Fruta',
      subfamilia: 'Nectarina',
      unidad: 'CAJ',
      costoPromedio: 16200,
      stockByBodega: new Map([['23', 1200]]),
    },
    {
      codigo: '03990001',
      nombre: 'FLETE MARÍTIMO EXPORTACIÓN',
      familia: 'Servicios',
      subfamilia: 'Fletes',
      unidad: 'UN',
      costoPromedio: 850000,
      stockByBodega: new Map(),
    },
  ];
  for (const e of extras) map.set(e.codigo, e);

  return [...map.values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .slice(0, limit);
}

/** Destinatarios exportación y proveedores desde INVENTARIO_A_MAYO + cartolas. */
function loadContrapartesFromMj(): ContraparteSeed[] {
  const clientes = new Map<string, ContraparteSeed>();
  const proveedores = new Map<string, ContraparteSeed>();

  const inv = readMjWorkbook('INVENTARIO_A_MAYO.xlsx');
  if (inv) {
    const venta = XLSX.utils.sheet_to_json<Record<string, string>>(inv.Sheets.VENTA);
    const compra = XLSX.utils.sheet_to_json<Record<string, string>>(inv.Sheets.COMPRA);
    for (const row of venta) {
      const nombre = String(row.destinatario ?? '').trim();
      if (!nombre) continue;
      if (!clientes.has(nombre)) {
        const idx = clientes.size;
        const rutExtranjero =
          nombre.includes('SARCO')
            ? '55.555.555-5'
            : `EX-${String(1000 + idx).padStart(4, '0')}`;
        clientes.set(nombre, {
          id: `CLI-MJ-${idx + 1}`,
          rut: rutExtranjero,
          razonSocial: nombre,
          giro: 'Importación y comercialización de frutas',
          tipo: 'CLIENTE',
          tipoCliente: 'EXPORTACION',
          direccion: 'Dirección según factura exportación',
          ciudad: nombre.includes('NORTH AMERICAN') ? 'Vancouver, CA' : 'Extranjero',
          vendedor: 'María González',
        });
      }
    }
    for (const row of compra) {
      const prov = String(row.Proveedor ?? '').trim();
      const prod = String(row.productor ?? '').trim();
      if (prov && !proveedores.has(prov)) {
        proveedores.set(prov, {
          id: 'PROV-ALM-SERVICES',
          rut: '77.032.639-7',
          razonSocial: prov,
          giro: 'Servicios de packing y logística',
          tipo: 'PROVEEDOR',
          direccion: 'Camino Almahue s/n',
          comuna: 'Santa Cruz',
          ciudad: 'Colchagua',
        });
      }
      if (prod && !proveedores.has(prod)) {
        proveedores.set(prod, {
          id: 'PROV-LOS-MOSTOS',
          rut: '76.543.891-8',
          razonSocial: prod,
          giro: 'Producción agrícola — cerezas',
          tipo: 'PROVEEDOR',
          direccion: 'Fundo Los Mostos',
          comuna: 'Santa Cruz',
          ciudad: 'Colchagua',
        });
      }
    }
  }

  const fijos: ContraparteSeed[] = [
    {
      id: 'CLI-MJ-NAC',
      rut: '76.882.110-0',
      razonSocial: 'COMERCIAL FRUTAM SPA',
      giro: 'Comercialización fruta nacional',
      tipo: 'CLIENTE',
      tipoCliente: 'NACIONAL',
      direccion: 'Av. O\'Higgins 450',
      comuna: 'Curicó',
      ciudad: 'Maule',
      vendedor: 'Carolina Pérez',
    },
    {
      id: 'PROV-EMB-TROYA',
      rut: '77.654.321-7',
      razonSocial: 'EMBALAJES TROYA SPA',
      giro: 'Fabricación de embalajes',
      tipo: 'PROVEEDOR',
      direccion: 'Parque Industrial Curicó',
      comuna: 'Curicó',
      ciudad: 'Maule',
    },
    {
      id: 'PROV-ENVAPACK',
      rut: '76.991.220-7',
      razonSocial: 'ENVAPACK SPA',
      giro: 'Envases impresos para exportación',
      tipo: 'PROVEEDOR',
      direccion: 'Ruta 5 Sur km 178',
      comuna: 'San Fernando',
      ciudad: 'Colchagua',
    },
    {
      id: 'PROV-OMEGA',
      rut: '78.252.011-3',
      razonSocial: 'OMEGA EXPORT SPA',
      giro: 'Servicios comercio exterior',
      tipo: 'PROVEEDOR',
      direccion: 'Nueva Morandé 21',
      comuna: 'Santiago',
      ciudad: 'Región Metropolitana',
    },
    {
      id: 'PROV-TERRA',
      rut: '76.120.045-3',
      razonSocial: 'TERRA EXPORTS SPA',
      giro: 'Broker frutícola exportación',
      tipo: 'PROVEEDOR',
      direccion: 'Av. Apoquindo 4800',
      comuna: 'Las Condes',
      ciudad: 'Santiago',
    },
  ];

  for (const c of fijos) {
    if (c.tipo === 'CLIENTE') clientes.set(c.razonSocial, c);
    else proveedores.set(c.razonSocial, c);
  }

  return [...clientes.values(), ...proveedores.values()];
}

/** RUT sintético determinístico (solo demo; no usar en prod). */
function syntheticRut(seed: number): string {
  const base = 76000000 + seed * 137;
  const s = String(base);
  let sum = 0;
  let multiplier = 2;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    sum += Number(s[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const mod = 11 - (sum % 11);
  const dv = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}-${dv}`;
}

async function assertBaseSeed() {
  const admin = await prisma.usuario.findUnique({ where: { id: 'U-1' } });
  const cuentas = await prisma.cuentaContable.count({ where: { empresaId: EMP } });
  if (!admin || cuentas < 10) {
    throw new Error(
      'Falta seed base. Ejecute primero: npm run seed',
    );
  }
}

async function cleanEmpresaOperativa() {
  console.log('[demo-real] Limpiando datos operativos EMP-1…');
  await prisma.cuentaCorrienteMovimiento.deleteMany({ where: { empresaId: EMP } });
  await prisma.movimientoCaja.deleteMany({ where: { empresaId: EMP } });
  await prisma.anticipoProductor.deleteMany({ where: { empresaId: EMP } });
  await prisma.pago.deleteMany({ where: { empresaId: EMP } });
  await prisma.movimientoCartola.deleteMany({ where: { empresaId: EMP } });
  await prisma.cartolaBancaria.deleteMany({ where: { empresaId: EMP } });
  await prisma.documentoAging.deleteMany({ where: { empresaId: EMP } });
  await prisma.guiaDespacho.deleteMany({ where: { empresaId: EMP } });
  await prisma.asiento.deleteMany({ where: { empresaId: EMP } });
  await prisma.factorHonorario.deleteMany({ where: { empresaId: EMP } });
  await prisma.periodoCierreContratista.deleteMany({ where: { empresaId: EMP } });
  await prisma.registroCompra.deleteMany({ where: { empresaId: EMP } });
  await prisma.recepcionOc.deleteMany({ where: { empresaId: EMP } });
  await prisma.aprobacionOc.deleteMany({ where: { empresaId: EMP } });
  await prisma.ordenCompra.deleteMany({ where: { empresaId: EMP } });
  await prisma.documentoComercial.deleteMany({ where: { empresaId: EMP } });
  await prisma.prospecto.deleteMany({ where: { empresaId: EMP } });
  await prisma.ingresoLaborDiario.deleteMany({ where: { empresaId: EMP } });
  await prisma.facturaContratista.deleteMany({ where: { empresaId: EMP } });
  await prisma.proformaContratista.deleteMany({ where: { empresaId: EMP } });
  await prisma.movimientoBodega.deleteMany({ where: { empresaId: EMP } });
  await prisma.stockInsumoBodega.deleteMany({ where: { empresaId: EMP } });
  await prisma.insumo.deleteMany({ where: { empresaId: EMP } });
  await prisma.bodega.deleteMany({ where: { empresaId: EMP } });
  await prisma.clienteCuentaBancaria.deleteMany({ where: { empresaId: EMP } });
  await prisma.clienteContacto.deleteMany({ where: { empresaId: EMP } });
  await prisma.clienteDireccion.deleteMany({ where: { empresaId: EMP } });
  await prisma.clienteCambio.deleteMany({ where: { empresaId: EMP } });
  await prisma.cliente.deleteMany({ where: { empresaId: EMP } });
  await prisma.proveedorCuentaBancaria.deleteMany({ where: { empresaId: EMP } });
  await prisma.proveedorContacto.deleteMany({ where: { empresaId: EMP } });
  await prisma.proveedorDireccion.deleteMany({ where: { empresaId: EMP } });
  await prisma.proveedorCambio.deleteMany({ where: { empresaId: EMP } });
  await prisma.proveedor.deleteMany({ where: { empresaId: EMP } });
}

async function seedEmpresaIdentidad() {
  await prisma.empresa.update({
    where: { id: EMP },
    data: {
      razonSocial: 'Almahue Export SpA',
      giro: 'Exportación de frutas frescas y servicios de packing',
      direccion: 'Camino Almahue s/n',
      comuna: 'Santa Cruz',
      ciudad: 'Colchagua',
      telefono: '+56 72 200 0000',
      emailContacto: 'contacto@almahue.cl',
    },
  });
  console.log('  empresa EMP-1 → Almahue Export SpA');
}

async function seedBodegas(): Promise<Map<string, string>> {
  const almaToId = new Map<string, string>();
  let idx = 0;
  for (const [almaCode, meta] of Object.entries(BODEGA_ALMAWEB)) {
    idx += 1;
    const id = `BOD-MJ-${idx}`;
    await prisma.bodega.create({
      data: {
        id,
        codigo: meta.codigo,
        nombre: meta.nombre,
        activa: true,
        empresaId: EMP,
      },
    });
    almaToId.set(almaCode, id);
  }
  console.log(`  ${almaToId.size} bodegas (Packing / Frigorífico / Despacho)`);
  return almaToId;
}

async function seedInsumosYStock(
  insumos: InsumoSeed[],
  almaBodegaToId: Map<string, string>,
): Promise<Map<string, string>> {
  const codigoToId = new Map<string, string>();
  let n = 0;
  for (const ins of insumos) {
    n += 1;
    const id = `INS-MJ-${String(n).padStart(3, '0')}`;
    let stockTotal = 0;
    await prisma.insumo.create({
      data: {
        id,
        codigo: ins.codigo,
        familia: ins.familia,
        subfamilia: ins.subfamilia,
        nombre: ins.nombre,
        unidad: ins.unidad,
        stock: 0,
        costoPromedio: ins.costoPromedio,
        empresaId: EMP,
      },
    });
    codigoToId.set(ins.codigo, id);

    for (const [almaCode, qtyRaw] of ins.stockByBodega) {
      const bodegaId = almaBodegaToId.get(almaCode);
      if (!bodegaId || qtyRaw <= 0) continue;
      const qty = Math.min(Math.round(qtyRaw), 50000);
      stockTotal += qty;
      await prisma.stockInsumoBodega.create({
        data: {
          empresaId: EMP,
          insumoId: id,
          bodegaId,
          cantidad: qty,
        },
      });
    }
    if (stockTotal > 0) {
      await prisma.insumo.update({
        where: { id },
        data: { stock: stockTotal },
      });
    }
  }
  console.log(`  ${insumos.length} insumos + stock por bodega`);
  return codigoToId;
}

async function seedContrapartes(rows: ContraparteSeed[]) {
  const usedRuts = new Set<string>();
  for (const row of rows) {
    let rut = row.rut;
    if (usedRuts.has(rut)) rut = syntheticRut(usedRuts.size + 50);
    usedRuts.add(rut);
    if (row.tipo === 'CLIENTE') {
      await prisma.cliente.create({
        data: {
          id: row.id,
          rut,
          razonSocial: row.razonSocial,
          giro: row.giro,
          tipoCliente: row.tipoCliente ?? 'NACIONAL',
          direccion: row.direccion,
          comuna: row.comuna,
          ciudad: row.ciudad,
          telefono: row.telefono,
          email: row.email,
          vendedor: row.vendedor ?? 'María González',
          credito: 80_000_000,
          activo: true,
          empresaId: EMP,
          direcciones: row.direccion
            ? {
                create: {
                  tipo: 'DESPACHO',
                  linea: row.direccion,
                  comuna: row.comuna,
                  ciudad: row.ciudad,
                  principal: true,
                  empresaId: EMP,
                },
              }
            : undefined,
        },
      });
    } else {
      await prisma.proveedor.create({
        data: {
          id: row.id,
          rut,
          razonSocial: row.razonSocial,
          giro: row.giro,
          contacto: 'Contacto comercial',
          activo: true,
          empresaId: EMP,
          direcciones: row.direccion
            ? {
                create: {
                  tipo: 'DESPACHO',
                  linea: row.direccion,
                  comuna: row.comuna,
                  ciudad: row.ciudad,
                  principal: true,
                  empresaId: EMP,
                },
              }
            : undefined,
        },
      });
    }
  }
  const cli = rows.filter((r) => r.tipo === 'CLIENTE').length;
  const prov = rows.filter((r) => r.tipo === 'PROVEEDOR').length;
  console.log(`  ${cli} clientes + ${prov} proveedores (MJ)`);
}

async function pickCuentas() {
  const cuentas = await prisma.cuentaContable.findMany({
    where: { empresaId: EMP, activa: true, noImputable: false },
    orderBy: { codigo: 'asc' },
  });
  const byCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
  const pick = (...codigos: string[]) => {
    for (const c of codigos) {
      const hit = byCodigo.get(c);
      if (hit) return hit;
    }
    return cuentas[0];
  };
  return {
    cuentas,
    caja: pick('1-1-01-01'),
    ingreso: cuentas.find((c) => c.tipo === 'INGRESO') ?? pick('5-1-01-01', '5-0-00-00'),
    gasto: cuentas.find((c) => c.tipo === 'GASTO') ?? pick('6-1-01-01', '6-0-00-00'),
    clientes: cuentas.find((c) => /cliente/i.test(c.nombre)) ?? pick('1-1-03-01'),
    proveedores: cuentas.find((c) => /proveedor/i.test(c.nombre)) ?? pick('2-1-01-01'),
    ivaDebito: cuentas.find((c) => /iva/i.test(c.nombre) && c.tipo === 'PASIVO') ?? pick('2-1-02-01'),
  };
}

async function seedGoldenPaths(ctx: {
  insumoIds: Map<string, string>;
  bodegaIds: Map<string, string>;
  contrapartes: ContraparteSeed[];
}) {
  const { insumoIds, bodegaIds, contrapartes } = ctx;
  const ctas = await pickCuentas();

  const cliSarco =
    contrapartes.find((c) => c.tipo === 'CLIENTE' && c.razonSocial.includes('SARCO')) ??
    contrapartes.find((c) => c.tipo === 'CLIENTE')!;
  const cliNac =
    contrapartes.find((c) => c.id === 'CLI-MJ-NAC') ??
    contrapartes.find((c) => c.tipoCliente === 'NACIONAL');
  const provAlm =
    contrapartes.find((c) => c.id === 'PROV-ALM-SERVICES') ??
    contrapartes.find((c) => c.tipo === 'PROVEEDOR' && c.razonSocial.includes('ALM SERVICES'))!;

  if (!cliNac) throw new Error('Cliente nacional no encontrado en contrapartes MJ');
  const insCereza = insumoIds.get('00000003')!;
  const bodegaFrig = bodegaIds.get('23')!;
  const bodegaPack = bodegaIds.get('2')!;

  // --- OC APROBADA (lista para recepción) ---
  const ocLineas = [
    linea('CAJA MASTER ALMAHUE PREMIUM', 5000, 535.43),
    linea('MALETA 2,5 KG ALMAHUE PREMIUM', 1200, 424.48),
    linea('ABSORD BILAMINAR 27X46', 3000, 19.62),
  ] as unknown as Prisma.InputJsonValue;
  const ocNeto = 5000 * 535.43 + 1200 * 424.48 + 3000 * 19.62;

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-MJ-APROB',
      numero: 'OC-2026-MJ-001',
      fecha: d('2026-08-05'),
      proveedor: provAlm.razonSocial,
      proveedorId: provAlm.id,
      solicitante: 'Carolina Pérez',
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      moneda: 'CLP',
      neto: ocNeto,
      afacto: 'AFECTO',
      estado: 'APROBADO',
      departamento: 'Packing',
      lineas: ocLineas,
      distribucionCc: [
        { centroCostoId: 'CC-EMP-1-2', centroCosto: 'PACK · Packing', monto: ocNeto, porcentaje: 100 },
      ],
      empresaId: EMP,
      aprobaciones: {
        create: {
          id: 'APROC-MJ-OC-001',
          ocNumero: 'OC-2026-MJ-001',
          proveedor: provAlm.razonSocial,
          monto: ocNeto,
          solicitante: 'Carolina Pérez',
          aprobadorId: 'U-1',
          aprobadorNombre: 'Admin Almahue',
          resueltoPorId: 'U-1',
          resueltoPorNombre: 'Admin Almahue',
          estado: 'APROBADA',
          fecha: d('2026-08-06'),
          empresaId: EMP,
        },
      },
    },
  });

  // --- OV BORRADOR (lista para confirmar stock) — embarque 446 NAP ---
  const ovQty = 320;
  const ovPrecio = 24500;
  const ovNeto = ovQty * ovPrecio;
  const ovLineas = [
    linea('CEREZA 5 KG EXPORT', ovQty, ovPrecio, {
      tipoLinea: 'PRODUCTO',
      insumoId: insCereza,
      codigoProducto: '00000003',
      unidadMedida: 'CAJ',
      splits: [{ bodegaId: bodegaFrig, cantidad: ovQty }],
    }),
    linea('FLETE MARÍTIMO EXPORTACIÓN', 1, 1_850_000, { tipoLinea: 'FLETE' }),
  ] as unknown as Prisma.InputJsonValue;

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-MJ-OV-BORR',
      folio: 'OV-2026-446',
      tipo: 'ORDEN_VENTA',
      cliente: cliSarco.razonSocial,
      clienteId: cliSarco.id,
      fecha: d('2026-08-08'),
      neto: ovNeto + 1_850_000,
      lineas: ovLineas,
      estado: 'BORRADOR',
      receptorRut: cliSarco.rut,
      receptorGiro: cliSarco.giro,
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      observaciones: 'Embarque 446 · broker NAP · temporada 2025-2026',
      empresaId: EMP,
    },
  });

  // --- Factura exportación COMEX (CONTABILIZADA) — embarque 444 / folio 1973 ---
  const cajasExport = 1600;
  const precioUsdCaja = 28.5;
  const netoUsd = cajasExport * precioUsdCaja;
  const tc = 945.5;
  const netoClp = Math.round(netoUsd * tc);
  const facExpLineas = [
    linea('CEREZA 5 KG EXPORT', cajasExport, precioUsdCaja, {
      codigoProducto: '003',
      unidadMedida: 'CAJ',
      tipoLinea: 'PRODUCTO',
      insumoId: insCereza,
    }),
  ] as unknown as Prisma.InputJsonValue;

  const asientoExp = await prisma.asiento.create({
    data: {
      id: 'ASI-MJ-FEX-1973',
      numero: 'ASI-2026-08-FEX-1973',
      periodo: '2026-08',
      fecha: d('2026-08-10'),
      tipo: 'DIARIO',
      glosa: 'Factura exportación FEX-1973 · embarque 444 · SARCOFRUIT',
      debe: netoClp,
      haber: netoClp,
      estado: 'CONTABILIZADO',
      origen: 'DOCUMENTO:DOC-MJ-FEX-1973',
      lineas: [
        { debe: netoClp, haber: 0, cuentaId: ctas.clientes?.id, glosa: 'Clientes exportación' },
        { debe: 0, haber: netoClp, cuentaId: ctas.ingreso?.id, glosa: 'Ingreso exportación exento' },
      ] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
    },
  });

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-MJ-FEX-1973',
      folio: 'FEX-1973',
      tipo: 'FACTURA',
      cliente: cliSarco.razonSocial,
      clienteId: cliSarco.id,
      fecha: d('2026-08-10'),
      neto: netoClp,
      iva: 0,
      lineas: facExpLineas,
      estado: 'CONTABILIZADA',
      indicadorVenta: 'EXPORTACION',
      monedaCodigo: 'USD',
      tipoCambio: tc,
      paisDestino: 'EC',
      puertoEmbarque: 'San Antonio',
      puertoDesembarque: 'Guayaquil',
      clausulaVenta: 'FOB',
      viaTransporte: 'Marítima',
      modalidadVenta: 'Consignación libre',
      bultoTipoCodigo: '22',
      bultoCantidad: cajasExport,
      bultoMarca: '-',
      montoOtraMoneda: netoUsd,
      montoExentoOtraMoneda: netoClp,
      observaciones: `TC ${tc} · Embarque 444 · broker TERRA EXPORTS`,
      receptorRut: '55.555.555-5',
      receptorGiro: 'Importación de frutas',
      asientoOriginal: asientoExp.numero,
      billingStub: true,
      billingPartner: 'stub',
      billingDisclaimer: 'Emisión simulada (billing-gateway stub) — no es DTE SII',
      billingEmittedAt: d('2026-08-10'),
      empresaId: EMP,
    },
  });

  await prisma.cuentaCorrienteMovimiento.create({
    data: {
      id: 'CCM-MJ-FEX-1973',
      empresaId: EMP,
      terceroTipo: 'CLIENTE',
      terceroId: cliSarco.id,
      terceroNombre: cliSarco.razonSocial,
      fecha: d('2026-08-10'),
      documentoRef: 'FEX-1973',
      documentoTipo: 'FACTURA',
      debe: netoClp,
      haber: 0,
      saldo: netoClp,
      glosa: 'Factura exportación embarque 444',
      origen: 'VENTA',
    },
  });

  // --- Factura nacional (CONTABILIZADA) ---
  const facNacNeto = 4_850_000;
  const facNacIva = Math.round(facNacNeto * 0.19);
  const facNacTotal = facNacNeto + facNacIva;
  const facNacLineas = [
    linea('CEREZA PREMIUM mercado nacional', 500, 8500, {
      tipoLinea: 'PRODUCTO',
      insumoId: insCereza,
      codigoProducto: '00000003',
      unidadMedida: 'CAJ',
      splits: [{ bodegaId: bodegaPack, cantidad: 500 }],
    }),
    linea('Servicio selección packing', 1, 600_000, { tipoLinea: 'SERVICIO' }),
  ] as unknown as Prisma.InputJsonValue;

  const asientoNac = await prisma.asiento.create({
    data: {
      id: 'ASI-MJ-FAC-NAC',
      numero: 'ASI-2026-08-FAC-45821',
      periodo: '2026-08',
      fecha: d('2026-08-12'),
      tipo: 'DIARIO',
      glosa: 'Factura nacional FAC-45821 · COMERCIAL FRUTAM',
      debe: facNacTotal,
      haber: facNacTotal,
      estado: 'CONTABILIZADO',
      origen: 'DOCUMENTO:DOC-MJ-FAC-NAC',
      lineas: [
        { debe: facNacTotal, haber: 0, cuentaId: ctas.clientes?.id, glosa: 'Clientes FAC-45821' },
        { debe: 0, haber: facNacNeto, cuentaId: ctas.ingreso?.id, glosa: 'Ingreso venta nacional' },
        { debe: 0, haber: facNacIva, cuentaId: ctas.ivaDebito?.id, glosa: 'IVA débito fiscal' },
      ] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
    },
  });

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-MJ-FAC-NAC',
      folio: 'FAC-45821',
      tipo: 'FACTURA',
      cliente: cliNac!.razonSocial,
      clienteId: cliNac!.id,
      fecha: d('2026-08-12'),
      neto: facNacNeto,
      iva: facNacIva,
      lineas: facNacLineas,
      estado: 'CONTABILIZADA',
      indicadorVenta: 'VENTA',
      formaPago: 'Crédito 30 días',
      receptorRut: cliNac!.rut,
      receptorGiro: cliNac!.giro,
      asientoOriginal: asientoNac.numero,
      billingStub: true,
      billingPartner: 'stub',
      billingEmittedAt: d('2026-08-12'),
      empresaId: EMP,
    },
  });

  await prisma.cuentaCorrienteMovimiento.create({
    data: {
      id: 'CCM-MJ-FAC-NAC',
      empresaId: EMP,
      terceroTipo: 'CLIENTE',
      terceroId: cliNac!.id,
      terceroNombre: cliNac!.razonSocial,
      fecha: d('2026-08-12'),
      documentoRef: 'FAC-45821',
      documentoTipo: 'FACTURA',
      debe: facNacTotal,
      haber: 0,
      saldo: facNacTotal,
      glosa: 'Factura venta nacional',
      origen: 'VENTA',
    },
  });

  console.log('  golden paths: OC APROBADA · OV BORRADOR · FEX-1973 · FAC-45821');
}

async function main() {
  console.log('[demo-real] Seed demo con datos reales MJ');
  console.log(`  fuente: ${MJ_DIR}`);

  if (!existsSync(MJ_DIR)) {
    throw new Error(`Carpeta MJ no encontrada: ${MJ_DIR}`);
  }

  await assertBaseSeed();
  await cleanEmpresaOperativa();
  await seedEmpresaIdentidad();

  const insumos = loadInsumosFromMovExcel(20);
  const contrapartes = loadContrapartesFromMj();
  const bodegaIds = await seedBodegas();
  const insumoIds = await seedInsumosYStock(insumos, bodegaIds);
  await seedContrapartes(contrapartes);
  await seedGoldenPaths({ insumoIds, bodegaIds, contrapartes });

  console.log('\n✅ seed-demo-real completado');
  console.log('   Login: admin@almahue.local / Admin123! · PIN 4821');
  console.log('   Golden paths:');
  console.log('   · OC-2026-MJ-001 → APROBADO (recepción pendiente)');
  console.log('   · OV-2026-446 → BORRADOR (confirmar stock)');
  console.log('   · FEX-1973 → export COMEX contabilizada');
  console.log('   · FAC-45821 → venta nacional contabilizada');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
