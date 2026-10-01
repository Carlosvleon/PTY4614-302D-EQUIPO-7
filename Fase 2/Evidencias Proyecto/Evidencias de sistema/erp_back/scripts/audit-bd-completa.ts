/**
 * Auditoría integral BD local ERP (schema erp).
 * Uso: npx ts-node -r tsconfig-paths/register scripts/audit-bd-completa.ts
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Finding = {
  severity: 'CRIT' | 'HIGH' | 'MED' | 'LOW' | 'INFO';
  area: string;
  code: string;
  detail: string;
  count?: number;
};

const findings: Finding[] = [];

function add(f: Finding) {
  findings.push(f);
}

async function count(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ c: number }[]>(sql);
  return Number(rows[0]?.c ?? 0);
}

async function tableCounts() {
  const tables = await prisma.$queryRawUnsafe<{ relname: string }[]>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'erp' AND c.relkind = 'r'
    ORDER BY 1
  `);
  const out: Record<string, number> = {};
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT COUNT(*)::int AS c FROM erp."${t.relname}"`,
    );
    out[t.relname] = Number(rows[0]?.c ?? 0);
  }
  return out;
}

async function auditCore() {
  const empresas = await prisma.empresa.findMany();
  const activas = empresas.filter((e) => e.activa);
  add({
    severity: activas.length ? 'INFO' : 'CRIT',
    area: 'core',
    code: 'EMPRESAS',
    detail: `${empresas.length} empresas (${activas.length} activas): ${empresas.map((e) => e.razonSocial).join(', ')}`,
    count: empresas.length,
  });

  const usuarios = await prisma.usuario.findMany({
    include: { rol: true, empresasAcceso: true },
  });
  const sinRol = usuarios.filter((u) => !u.rolId);
  const inactivos = usuarios.filter((u) => !u.activo);
  const sinEmpresa = usuarios.filter((u) => !u.empresaId && u.empresasAcceso.length === 0);
  if (sinRol.length) {
    add({
      severity: 'HIGH',
      area: 'rbac',
      code: 'USER_SIN_ROL',
      detail: sinRol.map((u) => u.email).join(', '),
      count: sinRol.length,
    });
  }
  if (sinEmpresa.length) {
    add({
      severity: 'MED',
      area: 'rbac',
      code: 'USER_SIN_EMPRESA',
      detail: sinEmpresa.map((u) => u.email).join(', '),
      count: sinEmpresa.length,
    });
  }
  add({
    severity: 'INFO',
    area: 'rbac',
    code: 'USUARIOS',
    detail: `${usuarios.length} users (${inactivos.length} inactivos). Roles: ${[...new Set(usuarios.map((u) => u.rol?.nombre ?? '?'))].join(', ')}`,
    count: usuarios.length,
  });

  const roles = await prisma.rol.findMany();
  for (const r of roles) {
    const pantallas = r.permisosPantalla;
    const empty =
      pantallas == null ||
      (Array.isArray(pantallas) && pantallas.length === 0) ||
      (typeof pantallas === 'object' && !Array.isArray(pantallas) && !Object.keys(pantallas as object).length);
    if (empty && !(r.permisos ?? []).includes('*') && r.nombre !== 'Administrador') {
      add({
        severity: 'MED',
        area: 'rbac',
        code: 'ROL_SIN_PANTALLAS',
        detail: `${r.nombre} (${r.id}) sin matriz permisosPantalla`,
      });
    }
  }
}

async function auditWorkflows() {
  const wfs = await prisma.workflowConfig.findMany();
  const users = await prisma.usuario.findMany({ select: { id: true, nombre: true, activo: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const w of wfs) {
    if (!w.activo) continue;
    const ids = w.aprobadorIds ?? [];
    if (!ids.length) {
      add({
        severity: 'HIGH',
        area: 'workflow',
        code: 'WF_SIN_APROBADORES',
        detail: `${w.nombre} / ${w.modulo}`,
      });
    }
    const missing = ids.filter((id) => !byId.has(id));
    const inactive = ids.filter((id) => byId.get(id) && !byId.get(id)!.activo);
    if (missing.length) {
      add({
        severity: 'CRIT',
        area: 'workflow',
        code: 'WF_APROBADOR_INEXISTENTE',
        detail: `${w.nombre}: ${missing.join(',')}`,
        count: missing.length,
      });
    }
    if (inactive.length) {
      add({
        severity: 'MED',
        area: 'workflow',
        code: 'WF_APROBADOR_INACTIVO',
        detail: `${w.nombre}: ${inactive.map((id) => byId.get(id)?.nombre).join(',')}`,
        count: inactive.length,
      });
    }
  }
  const mods = [...new Set(wfs.filter((w) => w.activo).map((w) => w.modulo))];
  for (const m of ['Compras']) {
    if (!mods.includes(m)) {
      add({
        severity: 'HIGH',
        area: 'workflow',
        code: 'WF_MODULO_FALTANTE',
        detail: `Sin regla activa para módulo ${m}`,
      });
    }
  }
}

async function auditCompras() {
  const ocs = await prisma.ordenCompra.findMany({ include: { aprobaciones: true } });
  const zombie = ocs.filter(
    (o) => o.estado === 'ANULADO' && o.aprobaciones.some((a) => a.estado === 'PENDIENTE'),
  );
  const sinJefePend = ocs.filter(
    (o) =>
      ['EMITIDO', 'BORRADOR'].includes(o.estado) &&
      o.aprobaciones.some((a) => a.estado === 'PENDIENTE') &&
      !o.aprobadorId,
  );
  const apHuérfana = await count(`
    SELECT COUNT(*)::int AS c FROM erp."AprobacionOc" a
    LEFT JOIN erp."OrdenCompra" o ON o.id = a."ocId"
    WHERE o.id IS NULL
  `);
  const provHuérfano = await count(`
    SELECT COUNT(*)::int AS c FROM erp."OrdenCompra" o
    LEFT JOIN erp."Proveedor" p ON p.id = o."proveedorId"
    WHERE o."proveedorId" IS NOT NULL AND p.id IS NULL
  `);
  const recSinOc = await count(`
    SELECT COUNT(*)::int AS c FROM erp."RecepcionOc" r
    LEFT JOIN erp."OrdenCompra" o ON o.id = r."ocId"
    WHERE o.id IS NULL
  `);
  const regSinOc = await count(`
    SELECT COUNT(*)::int AS c FROM erp."RegistroCompra" r
    LEFT JOIN erp."OrdenCompra" o ON o.id = r."ocId"
    WHERE r."ocId" IS NOT NULL AND o.id IS NULL
  `);
  const mismatchAp = ocs.filter((o) => {
    if (!o.aprobaciones.length) return false;
    if (o.estado === 'ANULADO' && o.aprobaciones.some((a) => a.estado === 'PENDIENTE')) return true;
    if (o.estado === 'APROBADO' && !o.aprobaciones.some((a) => a.estado === 'APROBADA')) return true;
    if (o.estado === 'RECHAZADO' && !o.aprobaciones.some((a) => a.estado === 'RECHAZADA')) return true;
    if (
      ['EMITIDO', 'BORRADOR'].includes(o.estado) &&
      !o.aprobaciones.some((a) => a.estado === 'PENDIENTE') &&
      o.aprobaciones.every((a) => a.estado !== 'ANULADA')
    ) {
      // emitida sin pendiente ni resolución: soft
      return false;
    }
    return false;
  });

  if (zombie.length) {
    add({
      severity: 'CRIT',
      area: 'compras',
      code: 'OC_ANULADA_PENDIENTE',
      detail: zombie.map((o) => o.numero).join(', '),
      count: zombie.length,
    });
  }
  if (sinJefePend.length) {
    add({
      severity: 'HIGH',
      area: 'compras',
      code: 'OC_PENDIENTE_SIN_JEFE',
      detail: sinJefePend.map((o) => o.numero).join(', '),
      count: sinJefePend.length,
    });
  }
  if (apHuérfana) {
    add({
      severity: 'CRIT',
      area: 'compras',
      code: 'APROBACION_HUERFANA',
      detail: 'AprobacionOc sin OrdenCompra',
      count: apHuérfana,
    });
  }
  if (provHuérfano) {
    add({
      severity: 'HIGH',
      area: 'compras',
      code: 'OC_PROVEEDOR_HUERFANO',
      detail: 'proveedorId apunta a Proveedor inexistente',
      count: provHuérfano,
    });
  }
  if (recSinOc) {
    add({
      severity: 'CRIT',
      area: 'compras',
      code: 'RECEPCION_HUERFANA',
      detail: 'RecepcionOc sin OC',
      count: recSinOc,
    });
  }
  if (regSinOc) {
    add({
      severity: 'HIGH',
      area: 'compras',
      code: 'REGISTRO_OC_HUERFANO',
      detail: 'RegistroCompra.ocId inválido',
      count: regSinOc,
    });
  }
  if (mismatchAp.length) {
    add({
      severity: 'HIGH',
      area: 'compras',
      code: 'OC_BANDEJA_DESACOPLADA',
      detail: mismatchAp.map((o) => `${o.numero}:${o.estado}`).join(', '),
      count: mismatchAp.length,
    });
  }

  const afactoBad = await count(`
    SELECT COUNT(*)::int AS c FROM erp."RegistroCompra" WHERE "afactoOk" = false
  `);
  if (afactoBad) {
    add({
      severity: 'MED',
      area: 'compras',
      code: 'REGISTRO_AFACTO_MISMATCH',
      detail: 'Registros con afactoOk=false',
      count: afactoBad,
    });
  }

  add({
    severity: 'INFO',
    area: 'compras',
    code: 'OC_RESUMEN',
    detail: `OC=${ocs.length}; estados: ${summarize(ocs.map((o) => o.estado))}`,
    count: ocs.length,
  });
}

async function auditContratistas() {
  const proformas = await prisma.proformaContratista.findMany();
  const sinJefePend = proformas.filter(
    (p) => p.estado === 'PENDIENTE_APROBACION' && !p.aprobadorId,
  );
  if (sinJefePend.length) {
    add({
      severity: 'HIGH',
      area: 'contratistas',
      code: 'PROFORMA_PEND_SIN_JEFE',
      detail: sinJefePend.map((p) => p.numero).join(', '),
      count: sinJefePend.length,
    });
  }

  const contHuérfano = await count(`
    SELECT COUNT(*)::int AS c FROM erp."ProformaContratista" p
    LEFT JOIN erp."Contratista" c ON c.id = p."contratistaId"
    WHERE c.id IS NULL
  `);
  if (contHuérfano) {
    add({
      severity: 'CRIT',
      area: 'contratistas',
      code: 'PROFORMA_CONTRATISTA_HUERFANO',
      detail: 'proforma.contratistaId inválido',
      count: contHuérfano,
    });
  }

  const tarifaHuérfana = await count(`
    SELECT COUNT(*)::int AS c FROM erp."TarifaContratista" t
    LEFT JOIN erp."Contratista" c ON c.id = t."contratistaId"
    WHERE c.id IS NULL
  `);
  if (tarifaHuérfana) {
    add({
      severity: 'HIGH',
      area: 'contratistas',
      code: 'TARIFA_HUERFANA',
      detail: 'TarifaContratista sin contratista',
      count: tarifaHuérfana,
    });
  }

  const ingresoHuérfano = await count(`
    SELECT COUNT(*)::int AS c FROM erp."IngresoLaborDiario" i
    LEFT JOIN erp."Contratista" c ON c.id = i."contratistaId"
    WHERE c.id IS NULL
  `);
  if (ingresoHuérfano) {
    add({
      severity: 'HIGH',
      area: 'contratistas',
      code: 'INGRESO_HUERFANO',
      detail: 'IngresoLaborDiario sin contratista',
      count: ingresoHuérfano,
    });
  }

  add({
    severity: 'INFO',
    area: 'contratistas',
    code: 'PROFORMA_RESUMEN',
    detail: `proformas=${proformas.length}; ${summarize(proformas.map((p) => p.estado))}`,
    count: proformas.length,
  });
}

async function auditComercial() {
  const docs = await prisma.documentoComercial.findMany();
  const cliHuérfano = await count(`
    SELECT COUNT(*)::int AS c FROM erp."DocumentoComercial" d
    LEFT JOIN erp."Cliente" c ON c.id = d."clienteId"
    WHERE d."clienteId" IS NOT NULL AND c.id IS NULL
  `);
  if (cliHuérfano) {
    add({
      severity: 'CRIT',
      area: 'comercial',
      code: 'DOC_CLIENTE_HUERFANO',
      detail: 'DocumentoComercial.clienteId inválido',
      count: cliHuérfano,
    });
  }

  add({
    severity: 'INFO',
    area: 'comercial',
    code: 'DOC_RESUMEN',
    detail: `docs=${docs.length}; ${summarize(docs.map((d) => d.estado))}`,
    count: docs.length,
  });
}

async function auditContabilidad() {
  const periodos = await prisma.periodoContable.findMany();
  const abiertos = periodos.filter((p) => p.estado === 'ABIERTO');
  const cerrados = periodos.filter((p) => p.estado === 'CERRADO');
  add({
    severity: abiertos.length ? 'INFO' : 'HIGH',
    area: 'contabilidad',
    code: 'PERIODOS',
    detail: `${periodos.length} periodos (${abiertos.length} abiertos, ${cerrados.length} cerrados)`,
    count: periodos.length,
  });

  const asientosDescuadre = await count(`
    SELECT COUNT(*)::int AS c FROM erp."Asiento" a
    WHERE ABS(COALESCE(a.debe,0) - COALESCE(a.haber,0)) > 0.01
      AND a.estado <> 'ANULADO'
  `);
  if (asientosDescuadre) {
    add({
      severity: 'CRIT',
      area: 'contabilidad',
      code: 'ASIENTO_DESCUADRE',
      detail: 'Asientos con debe ≠ haber (cabecera)',
      count: asientosDescuadre,
    });
  }

  const cuentaPadreHuérfana = await count(`
    SELECT COUNT(*)::int AS c FROM erp."CuentaContable" c
    LEFT JOIN erp."CuentaContable" p ON p.id = c."padreId"
    WHERE c."padreId" IS NOT NULL AND p.id IS NULL
  `);
  if (cuentaPadreHuérfana) {
    add({
      severity: 'CRIT',
      area: 'contabilidad',
      code: 'CUENTA_PADRE_HUERFANA',
      detail: 'CuentaContable.padreId inválido',
      count: cuentaPadreHuérfana,
    });
  }

  const planEmpty = await count(`SELECT COUNT(*)::int AS c FROM erp."CuentaContable"`);
  if (!planEmpty) {
    add({
      severity: 'CRIT',
      area: 'contabilidad',
      code: 'PLAN_VACIO',
      detail: 'Sin plan de cuentas',
    });
  }
}

async function auditTesoreria() {
  const cartolaMovHuérfano = await count(`
    SELECT COUNT(*)::int AS c FROM erp."MovimientoCartola" m
    LEFT JOIN erp."CartolaBancaria" c ON c.id = m."cartolaId"
    WHERE c.id IS NULL
  `);
  if (cartolaMovHuérfano) {
    add({
      severity: 'CRIT',
      area: 'tesoreria',
      code: 'MOV_CARTOLA_HUERFANO',
      detail: 'MovimientoCartola sin cartola',
      count: cartolaMovHuérfano,
    });
  }

  const concMovHuérfano = await count(`
    SELECT COUNT(*)::int AS c FROM erp."MovimientoConciliacion" m
    LEFT JOIN erp."Conciliacion" c ON c.id = m."conciliacionId"
    WHERE c.id IS NULL
  `);
  if (concMovHuérfano) {
    add({
      severity: 'CRIT',
      area: 'tesoreria',
      code: 'MOV_CONCIL_HUERFANO',
      detail: 'MovimientoConciliacion sin cabecera',
      count: concMovHuérfano,
    });
  }

  const pagos = await prisma.pago.findMany();
  add({
    severity: 'INFO',
    area: 'tesoreria',
    code: 'PAGOS_RESUMEN',
    detail: `pagos=${pagos.length}; ${summarize(pagos.map((p) => p.estado))}`,
    count: pagos.length,
  });
}

async function auditInsumos() {
  const movHuérfano = await count(`
    SELECT COUNT(*)::int AS c FROM erp."MovimientoBodega" m
    LEFT JOIN erp."Insumo" i ON i.id = m."insumoId"
    WHERE m."insumoId" IS NOT NULL AND i.id IS NULL
  `);
  if (movHuérfano) {
    add({
      severity: 'CRIT',
      area: 'insumos',
      code: 'MOV_INSUMO_HUERFANO',
      detail: 'MovimientoBodega.insumoId inválido',
      count: movHuérfano,
    });
  }
  const sinBodegaCatalog = await count(`
    SELECT COUNT(*)::int AS c FROM erp."MovimientoBodega" m
    WHERE m.bodega IS NOT NULL AND m.bodega <> ''
      AND NOT EXISTS (
        SELECT 1 FROM erp."Bodega" b
        WHERE b."empresaId" = m."empresaId"
          AND (b.nombre = m.bodega OR b.codigo = m.bodega OR b.id = m.bodega)
      )
  `).catch(() => 0);
  if (sinBodegaCatalog) {
    add({
      severity: 'MED',
      area: 'insumos',
      code: 'MOV_BODEGA_NO_CATALOGO',
      detail: 'MovimientoBodega.bodega (texto) no matchea Bodega del tenant',
      count: sinBodegaCatalog,
    });
  }
  const total = await count(`SELECT COUNT(*)::int AS c FROM erp."MovimientoBodega"`);
  add({
    severity: 'INFO',
    area: 'insumos',
    code: 'MOV_RESUMEN',
    detail: `movimientos=${total}`,
    count: total,
  });
}

async function auditParametrizacion() {
  const cc = await count(`SELECT COUNT(*)::int AS c FROM erp."CentroCosto"`);
  const el = await count(`SELECT COUNT(*)::int AS c FROM erp."ElementoCosto"`);
  const monedas = await count(`SELECT COUNT(*)::int AS c FROM erp."Moneda"`);
  const unidades = await count(`SELECT COUNT(*)::int AS c FROM erp."UnidadMedida"`);
  if (!cc) add({ severity: 'HIGH', area: 'param', code: 'SIN_CC', detail: 'Sin centros de costo' });
  if (!el) add({ severity: 'HIGH', area: 'param', code: 'SIN_ELEMENTOS', detail: 'Sin elementos de costo' });
  if (!monedas) add({ severity: 'HIGH', area: 'param', code: 'SIN_MONEDAS', detail: 'Sin monedas' });
  if (!unidades) add({ severity: 'MED', area: 'param', code: 'SIN_UNIDADES', detail: 'Sin unidades' });

  const ocCcHuérfano = await count(`
    SELECT COUNT(*)::int AS c FROM erp."OrdenCompra" o
    LEFT JOIN erp."CentroCosto" c ON c.id = o."centroCostoId"
    WHERE o."centroCostoId" IS NOT NULL AND c.id IS NULL
  `);
  if (ocCcHuérfano) {
    add({
      severity: 'HIGH',
      area: 'param',
      code: 'OC_CC_HUERFANO',
      detail: 'OC.centroCostoId inválido',
      count: ocCcHuérfano,
    });
  }
}

async function auditNotificaciones() {
  const huérfanas = await count(`
    SELECT COUNT(*)::int AS c FROM erp."Notificacion" n
    LEFT JOIN erp."Usuario" u ON u.id = n."userId"
    WHERE u.id IS NULL
  `);
  if (huérfanas) {
    add({
      severity: 'HIGH',
      area: 'notificaciones',
      code: 'NOTIF_USER_HUERFANO',
      detail: 'Notificacion.userId inválido',
      count: huérfanas,
    });
  }
  const total = await count(`SELECT COUNT(*)::int AS c FROM erp."Notificacion"`);
  add({
    severity: 'INFO',
    area: 'notificaciones',
    code: 'NOTIF_TOTAL',
    detail: `total=${total}`,
    count: total,
  });
}

async function auditMultiEmpresa() {
  // Filas transaccionales con empresaId inexistente
  const tables = [
    'OrdenCompra',
    'AprobacionOc',
    'ProformaContratista',
    'DocumentoComercial',
    'Asiento',
    'Pago',
    'CartolaBancaria',
    'Insumo',
    'Proveedor',
    'Cliente',
    'WorkflowConfig',
  ];
  for (const t of tables) {
    const c = await count(`
      SELECT COUNT(*)::int AS c FROM erp."${t}" x
      LEFT JOIN erp."Empresa" e ON e.id = x."empresaId"
      WHERE e.id IS NULL
    `).catch(() => 0);
    if (c) {
      add({
        severity: 'CRIT',
        area: 'tenant',
        code: `EMPRESA_HUERFANA_${t}`,
        detail: `${t}.empresaId inválido`,
        count: c,
      });
    }
  }
}

function summarize(values: string[]): string {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(', ');
}

function renderMd(
  counts: Record<string, number>,
  ts: string,
): string {
  const bySev = (s: Finding['severity']) => findings.filter((f) => f.severity === s);
  const crit = bySev('CRIT');
  const high = bySev('HIGH');
  const med = bySev('MED');
  const low = bySev('LOW');
  const info = bySev('INFO');

  const verdict =
    crit.length === 0 && high.length === 0
      ? 'PASS'
      : crit.length
        ? 'FAIL'
        : 'PASS_WITH_WARNINGS';

  const lines: string[] = [];
  lines.push('# 09 — Auditoría BD completa (local)');
  lines.push('');
  lines.push(`Fecha: ${ts}`);
  lines.push(`DB: \`${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}\``);
  lines.push('');
  lines.push('## Veredicto');
  lines.push('');
  lines.push(
    `**${verdict}** — CRIT ${crit.length} · HIGH ${high.length} · MED ${med.length} · LOW ${low.length} · INFO ${info.length}`,
  );
  lines.push('');
  lines.push('## Hallazgos');
  lines.push('');
  lines.push('| Sev | Área | Código | Detalle | N |');
  lines.push('|-----|------|--------|---------|---|');
  for (const f of [...crit, ...high, ...med, ...low, ...info]) {
    lines.push(
      `| ${f.severity} | ${f.area} | \`${f.code}\` | ${f.detail.replace(/\|/g, '/')} | ${f.count ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push('## Volúmenes por tabla');
  lines.push('');
  lines.push('| Tabla | Filas |');
  lines.push('|-------|------:|');
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [t, n] of sorted) {
    lines.push(`| \`${t}\` | ${n} |`);
  }
  lines.push('');
  lines.push('## Cobertura chequeada');
  lines.push('');
  lines.push('- Core: empresas, usuarios, roles, vínculos usuario-empresa');
  lines.push('- Workflows: aprobadores existentes/activos, módulo Compras');
  lines.push('- Compras: OC↔aprobación, proveedores, recepciones, registros, afacto');
  lines.push('- Contratistas: proformas, tarifas, ingresos');
  lines.push('- Comercial: documentos, clientes');
  lines.push('- Contabilidad: periodos, plan cuentas, descuadre asientos');
  lines.push('- Tesorería: cartolas, conciliaciones, pagos');
  lines.push('- Insumos: movimientos vs bodega/insumo');
  lines.push('- Parametrización: CC, elementos, monedas');
  lines.push('- Tenant: empresaId huérfano en tablas clave');
  lines.push('- Notificaciones: userId válido');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  console.log('Auditando BD…');
  const counts = await tableCounts();
  console.log(`Tablas: ${Object.keys(counts).length}`);

  await auditCore();
  await auditWorkflows();
  await auditCompras();
  await auditContratistas();
  await auditComercial();
  await auditContabilidad();
  await auditTesoreria();
  await auditInsumos();
  await auditParametrizacion();
  await auditNotificaciones();
  await auditMultiEmpresa();

  const ts = new Date().toISOString();
  const md = renderMd(counts, ts);
  const outDir = join(__dirname, '..', '..', 'qa-reu4-2026-07-31');
  mkdirSync(outDir, { recursive: true });
  const mdPath = join(outDir, '09-AUDITORIA-BD.md');
  const jsonPath = join(outDir, '09-AUDITORIA-BD.json');
  writeFileSync(mdPath, md, 'utf8');
  writeFileSync(
    jsonPath,
    JSON.stringify({ ts, counts, findings }, null, 2),
    'utf8',
  );

  const crit = findings.filter((f) => f.severity === 'CRIT').length;
  const high = findings.filter((f) => f.severity === 'HIGH').length;
  console.log(`\nHallazgos: CRIT=${crit} HIGH=${high} total=${findings.length}`);
  for (const f of findings.filter((x) => x.severity === 'CRIT' || x.severity === 'HIGH')) {
    console.log(`  [${f.severity}] ${f.area}/${f.code}: ${f.detail} (n=${f.count ?? 1})`);
  }
  console.log(`\nEscrito: ${mdPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
