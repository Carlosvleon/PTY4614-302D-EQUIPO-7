/**
 * Datos demo para la reunión (ruta presentación 2026-08).
 * Objetivo: cada pantalla del guion tiene filas y variedad de estados.
 * Periodo de trabajo: 2026-08 (ABIERTO). Fechas de negocio alineadas a agosto.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

const EMP = 'EMP-1';
const CLI = 'CLI-SEED-1';
const CLI_NAME = 'Exportadora Frutas del Sur';
const PROV1 = 'PROV-SEED-1';
const PROV1_NAME = 'Agro Insumos Sur';
const PROV2 = 'PROV-SEED-2';
const PROV2_NAME = 'Packaging Chile SpA';

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function linea(desc: string, qty: number, precio: number) {
  return {
    descripcion: desc,
    cantidad: qty,
    precioUnitario: precio,
    descuentoPct: 0,
    total: qty * precio,
  };
}

export async function seedDemoShowcase(prisma: PrismaClient) {
  // Orden de limpieza (FKs)
  await prisma.cuentaCorrienteMovimiento.deleteMany({ where: { empresaId: EMP } });
  await prisma.movimientoCaja.deleteMany({ where: { empresaId: EMP } });
  await prisma.anticipoProductor.deleteMany({ where: { empresaId: EMP } });
  await prisma.pago.deleteMany({ where: { empresaId: EMP } });
  await prisma.movimientoCartola.deleteMany({ where: { empresaId: EMP } });
  await prisma.cartolaBancaria.deleteMany({ where: { empresaId: EMP } });
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

  const cuentas = await prisma.cuentaContable.findMany({
    where: { empresaId: EMP, activa: true, noImputable: false },
    orderBy: { codigo: 'asc' },
  });
  const caja = cuentas.find((c) => c.codigo === '1-1-01-01') ?? cuentas[0];
  const ingreso = cuentas.find((c) => c.tipo === 'INGRESO') ?? cuentas.find((c) => c.codigo.startsWith('5-')) ?? caja;
  const gasto = cuentas.find((c) => c.tipo === 'GASTO') ?? cuentas.find((c) => c.codigo.startsWith('6-')) ?? caja;
  const clientesCta = cuentas.find((c) => /cliente/i.test(c.nombre)) ?? caja;
  const proveedoresCta = cuentas.find((c) => /proveedor/i.test(c.nombre)) ?? caja;

  // ---- Prospectos ----
  await prisma.prospecto.createMany({
    data: [
      {
        id: 'PROS-SEED-1',
        nombre: 'Frutícola Andes SpA',
        contacto: 'Luis Ramos',
        origen: 'Feria Fruittrade',
        estado: 'NUEVO',
        fecha: d('2026-08-02'),
        empresaId: EMP,
      },
      {
        id: 'PROS-SEED-2',
        nombre: 'Pack Export Ltda.',
        contacto: 'Ana Vidal',
        origen: 'Referido',
        estado: 'CONTACTADO',
        fecha: d('2026-08-05'),
        empresaId: EMP,
      },
      {
        id: 'PROS-SEED-3',
        nombre: 'Berry Valley',
        contacto: 'Camila Soto',
        origen: 'Web',
        estado: 'CALIFICADO',
        fecha: d('2026-08-08'),
        empresaId: EMP,
      },
    ],
  });

  // ---- OV demo + factura (compras no usan NP/cotización como documento) ----
  const ovLineas = [linea('Servicio packing temporada', 1, 1200000)] as unknown as Prisma.InputJsonValue;
  const facLineas = [
    linea('Packing temporada cereza', 1, 5500000),
    linea('Flete y logística puerto', 1, 3000000),
  ] as unknown as Prisma.InputJsonValue;

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-SEED-OV-1',
      folio: 'OV-1001',
      tipo: 'ORDEN_VENTA',
      cliente: CLI_NAME,
      clienteId: CLI,
      fecha: d('2026-08-07'),
      neto: 1500000,
      iva: Math.round(1500000 * 0.19),
      lineas: ovLineas,
      estado: 'CONFIRMADA',
      receptorRut: '76.999.888-8',
      empresaId: EMP,
    },
  });

  const asientoVenta = await prisma.asiento.create({
    data: {
      id: 'ASI-SEED-VTA-1',
      numero: 'ASI-2026-08-001',
      periodo: '2026-08',
      fecha: d('2026-08-10'),
      tipo: 'DIARIO',
      glosa: 'Factura venta FAC-1001 · packing + flete',
      debe: 10115000,
      haber: 10115000,
      estado: 'CONTABILIZADO',
      origen: 'DOCUMENTO:DOC-SEED-FAC-1',
      lineas: [
        { debe: 10115000, haber: 0, cuentaId: clientesCta?.id, glosa: 'Clientes FAC-1001' },
        { debe: 0, haber: 8500000, cuentaId: ingreso?.id, glosa: 'Ingreso packing' },
        { debe: 0, haber: 1615000, cuentaId: ingreso?.id, glosa: 'IVA débito (ref)' },
      ] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
    },
  });

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-SEED-FAC-1',
      folio: 'FAC-1001',
      tipo: 'FACTURA',
      cliente: CLI_NAME,
      clienteId: CLI,
      fecha: d('2026-08-10'),
      neto: 8500000,
      iva: 1615000,
      lineas: facLineas,
      estado: 'CONTABILIZADA',
      folioOrigen: 'OV-1001',
      documentoOrigenId: 'DOC-SEED-OV-1',
      asientoOriginal: asientoVenta.numero,
      receptorRut: '76.999.888-8',
      receptorGiro: 'Exportación frutícola',
      formaPago: 'Crédito 30',
      indicadorVenta: 'VENTA',
      billingStub: true,
      billingPartner: 'stub',
      billingDisclaimer: 'Emisión simulada (billing-gateway stub) — no es DTE SII',
      billingEmittedAt: d('2026-08-10'),
      empresaId: EMP,
    },
  });
  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-SEED-FAC-EMIT',
      folio: 'FAC-1002',
      tipo: 'FACTURA',
      cliente: CLI_NAME,
      clienteId: CLI,
      fecha: d('2026-08-12'),
      neto: 2100000,
      iva: 399000,
      lineas: [linea('Servicio selección', 1, 2100000)] as unknown as Prisma.InputJsonValue,
      estado: 'EMITIDO',
      indicadorVenta: 'VENTA',
      empresaId: EMP,
    },
  });
  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-SEED-FAC-EXP',
      folio: 'FAC-110-001',
      tipo: 'FACTURA',
      cliente: CLI_NAME,
      clienteId: CLI,
      fecha: d('2026-08-14'),
      neto: 5000000,
      iva: 0,
      lineas: [linea('Export cereza FOB', 1, 5000000)] as unknown as Prisma.InputJsonValue,
      estado: 'CONTABILIZADA',
      indicadorVenta: 'EXPORTACION',
      monedaCodigo: 'USD',
      tipoCambio: 945.5,
      paisDestino: 'US',
      puertoEmbarque: 'Valparaíso',
      puertoDesembarque: 'Long Beach',
      clausulaVenta: 'FOB',
      viaTransporte: 'Marítimo',
      montoOtraMoneda: 5290,
      empresaId: EMP,
    },
  });
  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-SEED-NC-1',
      folio: 'NC-1001',
      tipo: 'NC',
      cliente: CLI_NAME,
      clienteId: CLI,
      fecha: d('2026-08-15'),
      neto: 500000,
      iva: 95000,
      lineas: [linea('Devolución parcial FAC-1001', 1, 500000)] as unknown as Prisma.InputJsonValue,
      estado: 'CONTABILIZADA',
      folioOrigen: 'FAC-1001',
      documentoOrigenId: 'DOC-SEED-FAC-1',
      empresaId: EMP,
    },
  });

  // ---- Compras: OC en varios estados + recepción + libro ----
  const ocLineasPack = [linea('Cajas cartón 40×30', 500, 1200)] as unknown as Prisma.InputJsonValue;

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-SEED-BORR',
      numero: 'OC-2026-010',
      fecha: d('2026-08-02'),
      proveedor: PROV2_NAME,
      proveedorId: PROV2,
      solicitante: 'Carolina Pérez',
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      moneda: 'CLP',
      neto: 350000,
      afacto: 'AFECTO',
      estado: 'BORRADOR',
      departamento: 'Compras',
      lineas: [linea('Cintas packing', 100, 3500)] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
    },
  });

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-SEED-PEND',
      numero: 'OC-2026-001',
      fecha: d('2026-08-05'),
      proveedor: PROV1_NAME,
      proveedorId: PROV1,
      solicitante: 'Carolina Pérez',
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      moneda: 'CLP',
      neto: 2500000,
      afacto: 'AFECTO',
      estado: 'EMITIDO',
      departamento: 'Compras',
      lineas: [linea('Fertilizante NPK', 50, 50000)] as unknown as Prisma.InputJsonValue,
      distribucionCc: [
        { centroCostoId: 'CC-EMP-1-2', centroCosto: 'PACK · Packing', monto: 2500000, porcentaje: 100 },
      ],
      empresaId: EMP,
      aprobaciones: {
        create: {
          id: 'APROC-SEED-PEND',
          ocNumero: 'OC-2026-001',
          proveedor: PROV1_NAME,
          monto: 2500000,
          solicitante: 'Carolina Pérez',
          aprobadorId: 'U-1',
          aprobadorNombre: 'Admin Almahue',
          estado: 'PENDIENTE',
          fecha: d('2026-08-05'),
          empresaId: EMP,
        },
      },
    },
  });

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-SEED-APROB',
      numero: 'OC-2026-002',
      fecha: d('2026-08-06'),
      proveedor: PROV2_NAME,
      proveedorId: PROV2,
      solicitante: 'Jorge Sánchez',
      creadoPorId: 'U-3',
      creadoPorNombre: 'Jorge Sánchez',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      moneda: 'CLP',
      neto: 600000,
      afacto: 'AFECTO',
      estado: 'APROBADO',
      departamento: 'Packing',
      lineas: ocLineasPack,
      referenciaTipo: 'COTIZACION',
      referenciaFolio: 'COT-PROV-8841',
      referenciaFecha: d('2026-08-04'),
      empresaId: EMP,
      aprobaciones: {
        create: {
          id: 'APROC-SEED-OK',
          ocNumero: 'OC-2026-002',
          proveedor: PROV2_NAME,
          monto: 600000,
          solicitante: 'Jorge Sánchez',
          aprobadorId: 'U-1',
          aprobadorNombre: 'Admin Almahue',
          resueltoPorId: 'U-1',
          resueltoPorNombre: 'Admin Almahue',
          estado: 'APROBADA',
          fecha: d('2026-08-06'),
          empresaId: EMP,
        },
      },
      recepciones: {
        create: {
          id: 'REC-SEED-BORR',
          ocNumero: 'OC-2026-002',
          fecha: d('2026-08-08'),
          tcAplicado: 1,
          moneda: 'CLP',
          monto: 600000,
          estado: 'BORRADOR',
          lineas: ocLineasPack,
          empresaId: EMP,
        },
      },
    },
  });

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-SEED-RECH',
      numero: 'OC-2026-003',
      fecha: d('2026-08-04'),
      proveedor: PROV1_NAME,
      proveedorId: PROV1,
      solicitante: 'Carolina Pérez',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      moneda: 'CLP',
      neto: 180000,
      afacto: 'EXENTO',
      estado: 'RECHAZADO',
      departamento: 'Compras',
      lineas: [linea('Muestra laboratorio', 1, 180000)] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
      aprobaciones: {
        create: {
          id: 'APROC-SEED-RECH',
          ocNumero: 'OC-2026-003',
          proveedor: PROV1_NAME,
          monto: 180000,
          solicitante: 'Carolina Pérez',
          aprobadorId: 'U-1',
          aprobadorNombre: 'Admin Almahue',
          resueltoPorId: 'U-1',
          resueltoPorNombre: 'Admin Almahue',
          estado: 'RECHAZADA',
          fecha: d('2026-08-04'),
          empresaId: EMP,
        },
      },
    },
  });

  const asientoCompra = await prisma.asiento.create({
    data: {
      id: 'ASI-SEED-CMP-1',
      numero: 'ASI-2026-08-002',
      periodo: '2026-08',
      fecha: d('2026-08-11'),
      tipo: 'DIARIO',
      glosa: 'Factura compra FAC-CMP-001 / OC-2026-004',
      debe: 714000,
      haber: 714000,
      estado: 'CONTABILIZADO',
      origen: 'COMPRA:REG-SEED-1',
      lineas: [
        { debe: 600000, haber: 0, cuentaId: gasto?.id, glosa: 'Gasto insumos' },
        { debe: 114000, haber: 0, cuentaId: gasto?.id, glosa: 'IVA crédito (ref)' },
        { debe: 0, haber: 714000, cuentaId: proveedoresCta?.id, glosa: 'Proveedores' },
      ] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
    },
  });

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-SEED-REC',
      numero: 'OC-2026-004',
      fecha: d('2026-08-07'),
      proveedor: PROV1_NAME,
      proveedorId: PROV1,
      solicitante: 'Carolina Pérez',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      moneda: 'CLP',
      neto: 600000,
      afacto: 'AFECTO',
      estado: 'RECEPCIONADA',
      departamento: 'Compras',
      lineas: [linea('Urea 46%', 1000, 600)] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
      aprobaciones: {
        create: {
          id: 'APROC-SEED-REC',
          ocNumero: 'OC-2026-004',
          proveedor: PROV1_NAME,
          monto: 600000,
          solicitante: 'Carolina Pérez',
          aprobadorId: 'U-1',
          aprobadorNombre: 'Admin Almahue',
          resueltoPorId: 'U-1',
          resueltoPorNombre: 'Admin Almahue',
          estado: 'APROBADA',
          fecha: d('2026-08-07'),
          empresaId: EMP,
        },
      },
      recepciones: {
        create: {
          id: 'REC-SEED-OK',
          ocNumero: 'OC-2026-004',
          fecha: d('2026-08-09'),
          tcAplicado: 1,
          moneda: 'CLP',
          monto: 600000,
          estado: 'CONFIRMADA',
          lineas: [linea('Urea 46%', 1000, 600)] as unknown as Prisma.InputJsonValue,
          empresaId: EMP,
        },
      },
      registros: {
        create: {
          id: 'REG-SEED-1',
          ocNumero: 'OC-2026-004',
          factura: 'FAC-CMP-001',
          proveedorOc: PROV1_NAME,
          proveedorFactura: PROV1_NAME,
          proveedorId: PROV1,
          monto: 600000,
          afactoOc: 'AFECTO',
          afactoFactura: 'AFECTO',
          afactoOk: true,
          matchOk: true,
          matchDiff: 0,
          estado: 'CONTABILIZADA',
          asientoId: asientoCompra.id,
          asientoNumero: asientoCompra.numero,
          lineas: [linea('Urea 46% factura', 1000, 600)] as unknown as Prisma.InputJsonValue,
          empresaId: EMP,
        },
      },
    },
  });

  // Casos N OC → 1 factura (libro compras)
  for (const caso of [
    { factura: 'FAC-QA-1OC-001', ocs: [{ n: 'OC-QA-FAC1-01', neto: 120000, desc: 'Fertilizante NPK (1 OC)' }] },
    {
      factura: 'FAC-QA-2OC-001',
      ocs: [
        { n: 'OC-QA-FAC2-01', neto: 80000, desc: 'Cajas (2 OC · 1)' },
        { n: 'OC-QA-FAC2-02', neto: 95000, desc: 'Cintas (2 OC · 2)' },
      ],
    },
  ] as const) {
    for (const o of caso.ocs) {
      const oc = await prisma.ordenCompra.create({
        data: {
          numero: o.n,
          fecha: d('2026-08-09'),
          proveedor: PROV1_NAME,
          proveedorId: PROV1,
          solicitante: 'QA Seed',
          moneda: 'CLP',
          neto: o.neto,
          afacto: 'AFECTO',
          estado: 'RECEPCIONADA',
          departamento: 'Compras',
          lineas: [linea(o.desc, 1, o.neto)] as unknown as Prisma.InputJsonValue,
          empresaId: EMP,
        },
      });
      await prisma.registroCompra.create({
        data: {
          ocId: oc.id,
          ocNumero: o.n,
          factura: caso.factura,
          proveedorOc: PROV1_NAME,
          proveedorFactura: PROV1_NAME,
          proveedorId: PROV1,
          monto: o.neto,
          afactoOc: 'AFECTO',
          afactoFactura: 'AFECTO',
          afactoOk: true,
          estado: 'CONTABILIZADA',
          lineas: [linea(`${caso.factura} / ${o.n}`, 1, o.neto)] as unknown as Prisma.InputJsonValue,
          empresaId: EMP,
        },
      });
    }
  }

  // ---- Contratistas: ingresos + proformas en todos los estados ----
  await prisma.proformaContratista.create({
    data: {
      id: 'PRF-SEED-1',
      numero: 'PRF-2026-001',
      contratistaId: 'CTR-EMP-1-1',
      empresaId: EMP,
      periodo: '2026-08',
      montoNeto: 148000,
      moneda: 'CLP',
      estado: 'BORRADOR',
      creadoPorId: 'U-3',
      creadoPorNombre: 'Jorge Sánchez',
    },
  });
  await prisma.proformaContratista.create({
    data: {
      id: 'PRF-SEED-PEND',
      numero: 'PRF-2026-002',
      contratistaId: 'CTR-EMP-1-2',
      empresaId: EMP,
      periodo: '2026-08',
      montoNeto: 440000,
      moneda: 'CLP',
      estado: 'BORRADOR',
      creadoPorId: 'U-3',
      creadoPorNombre: 'Jorge Sánchez',
    },
  });
  await prisma.proformaContratista.create({
    data: {
      id: 'PRF-SEED-DEF',
      numero: 'PRF-2026-003',
      contratistaId: 'CTR-EMP-1-1',
      empresaId: EMP,
      periodo: '2026-08',
      montoNeto: 296000,
      moneda: 'CLP',
      estado: 'DEFINITIVA',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      aprobadoPorId: 'U-1',
      aprobadoPorNombre: 'Admin Almahue',
      aprobadaAt: d('2026-08-12'),
      creadoPorId: 'U-3',
      creadoPorNombre: 'Jorge Sánchez',
    },
  });
  await prisma.proformaContratista.create({
    data: {
      id: 'PRF-SEED-FAC',
      numero: 'PRF-2026-004',
      contratistaId: 'CTR-EMP-1-3',
      empresaId: EMP,
      periodo: '2026-07',
      montoNeto: 980000,
      moneda: 'CLP',
      estado: 'FACTURADA',
      aprobadoPorId: 'U-1',
      aprobadoPorNombre: 'Admin Almahue',
      aprobadaAt: d('2026-07-25'),
      factura: {
        create: {
          id: 'FCT-SEED-1',
          numero: 'F-88421',
          fecha: d('2026-07-28'),
          montoNeto: 980000,
          empresaId: EMP,
          proformasGrupoIds: ['PRF-SEED-FAC'],
        },
      },
    },
  });
  await prisma.proformaContratista.create({
    data: {
      id: 'PRF-SEED-RECH',
      numero: 'PRF-2026-005',
      contratistaId: 'CTR-EMP-1-2',
      empresaId: EMP,
      periodo: '2026-08',
      montoNeto: 120000,
      moneda: 'CLP',
      estado: 'RECHAZADA',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      aprobadoPorId: 'U-1',
      aprobadoPorNombre: 'Admin Almahue',
      aprobadaAt: d('2026-08-09'),
      creadoPorId: 'U-3',
      creadoPorNombre: 'Jorge Sánchez',
    },
  });

  await prisma.ingresoLaborDiario.createMany({
    data: [
      {
        id: 'ILD-SEED-PEND',
        fecha: d('2026-08-04'),
        contratistaId: 'CTR-EMP-1-1',
        centroCostoId: 'CC-EMP-1-3',
        laborId: 'LAB-EMP-1-1',
        actividadId: 'ACT-EMP-1-1',
        tipoJornada: 'JORNADA',
        cantidad: 8,
        precioUnitario: 18500,
        monto: 148000,
        estado: 'PENDIENTE',
        empresaId: EMP,
      },
      {
        id: 'ILD-SEED-ASOC',
        fecha: d('2026-08-05'),
        contratistaId: 'CTR-EMP-1-1',
        centroCostoId: 'CC-EMP-1-3',
        laborId: 'LAB-EMP-1-1',
        actividadId: 'ACT-EMP-1-1',
        tipoJornada: 'JORNADA',
        cantidad: 16,
        precioUnitario: 18500,
        monto: 296000,
        estado: 'ASOCIADO',
        proformaId: 'PRF-SEED-DEF',
        empresaId: EMP,
      },
      {
        id: 'ILD-SEED-FAC',
        fecha: d('2026-07-20'),
        contratistaId: 'CTR-EMP-1-3',
        centroCostoId: 'CC-EMP-1-2',
        laborId: 'LAB-EMP-1-4',
        actividadId: 'ACT-EMP-1-4',
        tipoJornada: 'TRATO',
        cantidad: 40,
        precioUnitario: 24500,
        monto: 980000,
        estado: 'FACTURADO',
        proformaId: 'PRF-SEED-FAC',
        facturaNumero: 'F-88421',
        empresaId: EMP,
      },
      {
        id: 'ILD-SEED-PEND2',
        fecha: d('2026-08-06'),
        contratistaId: 'CTR-EMP-1-2',
        centroCostoId: 'CC-EMP-1-3',
        laborId: 'LAB-EMP-1-3',
        actividadId: 'ACT-EMP-1-3',
        tipoJornada: 'JORNADA',
        cantidad: 20,
        precioUnitario: 22000,
        monto: 440000,
        estado: 'ASOCIADO',
        proformaId: 'PRF-SEED-PEND',
        empresaId: EMP,
      },
    ],
  });

  const asientoMo = await prisma.asiento.create({
    data: {
      id: 'ASI-SEED-MO-1',
      numero: 'ASI-2026-07-MO',
      periodo: '2026-07',
      fecha: d('2026-07-31'),
      tipo: 'DIARIO',
      glosa: 'Traspaso cierre contratistas 2026-07',
      debe: 980000,
      haber: 980000,
      estado: 'CONTABILIZADO',
      origen: 'TRASPASO_CONTRATISTAS:2026-07',
      lineas: [
        { debe: 980000, haber: 0, cuentaId: gasto?.id, glosa: 'Gasto MO' },
        { debe: 0, haber: 980000, cuentaId: proveedoresCta?.id, glosa: 'Contratistas por pagar' },
      ] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
    },
  });
  await prisma.periodoCierreContratista.create({
    data: {
      id: 'PCIERRE-SEED-1',
      empresaId: EMP,
      periodo: '2026-07',
      cerrado: true,
      asientoId: asientoMo.id,
      asientoNumero: asientoMo.numero,
      glosa: 'Cierre MO julio (seed demo)',
      montoTotal: 980000,
      tipoCambio: 1,
    },
  });

  // ---- Tesorería ----
  await prisma.pago.createMany({
    data: [
      {
        id: 'PAG-SEED-1',
        fecha: d('2026-08-12'),
        beneficiario: 'Servicios Agrícolas del Valle',
        monto: 980000,
        medio: 'Transferencia',
        estado: 'ACTIVO',
        monedaPago: 'CLP',
        documentosCalce: 'F-88421',
        empresaId: EMP,
      },
      {
        id: 'PAG-SEED-CLI',
        fecha: d('2026-08-16'),
        beneficiario: CLI_NAME,
        monto: 2000000,
        medio: 'Transferencia',
        estado: 'ACTIVO',
        monedaPago: 'CLP',
        documentosCalce: 'FAC-1001',
        empresaId: EMP,
      },
    ],
  });

  await prisma.cartolaBancaria.create({
    data: {
      id: 'CAR-SEED-1',
      banco: 'Banco Estado',
      bancoCodigo: '012',
      periodo: '2026-08-01 / 2026-08-20',
      mesContable: '2026/08',
      archivoNombre: 'cartola-agosto.xlsx',
      formato: 'EXCEL',
      movimientos: 2,
      montoTotal: 2980000,
      estado: 'CARGADA',
      pendientesContabilizar: 1,
      usuarioCarga: 'admin@almahue.local',
      empresaId: EMP,
      movimientosCartola: {
        create: [
          {
            fecha: d('2026-08-12'),
            referencia: 'TRX-7781',
            glosa: 'Pago contratista F-88421',
            monto: 980000,
            tipo: 'EGRESO',
            estadoContable: 'PENDIENTE',
            empresaId: EMP,
          },
          {
            fecha: d('2026-08-16'),
            referencia: 'TRX-8820',
            glosa: 'Cobro FAC-1001 (parcial)',
            monto: 2000000,
            tipo: 'INGRESO',
            estadoContable: 'CONTABILIZADO',
            empresaId: EMP,
          },
        ],
      },
    },
  });

  await prisma.movimientoCaja.createMany({
    data: [
      {
        id: 'CAJA-SEED-1',
        fecha: d('2026-08-03'),
        concepto: 'Apertura caja chica',
        ingreso: 500000,
        egreso: 0,
        saldo: 500000,
        empresaId: EMP,
      },
      {
        id: 'CAJA-SEED-2',
        fecha: d('2026-08-10'),
        concepto: 'Combustible campo',
        ingreso: 0,
        egreso: 85000,
        saldo: 415000,
        empresaId: EMP,
      },
    ],
  });

  await prisma.cuentaCorrienteMovimiento.createMany({
    data: [
      {
        id: 'CCM-SEED-1',
        empresaId: EMP,
        terceroTipo: 'CLIENTE',
        terceroId: CLI,
        terceroNombre: CLI_NAME,
        fecha: d('2026-08-10'),
        documentoRef: 'FAC-1001',
        documentoTipo: 'FACTURA',
        debe: 10115000,
        haber: 0,
        saldo: 10115000,
        glosa: 'Factura venta',
        origen: 'VENTA',
      },
      {
        id: 'CCM-SEED-2',
        empresaId: EMP,
        terceroTipo: 'CLIENTE',
        terceroId: CLI,
        terceroNombre: CLI_NAME,
        fecha: d('2026-08-16'),
        documentoRef: 'PAG-SEED-CLI',
        documentoTipo: 'PAGO',
        debe: 0,
        haber: 2000000,
        saldo: 8115000,
        glosa: 'Cobro parcial',
        origen: 'PAGO',
      },
    ],
  });

  await prisma.anticipoProductor.create({
    data: {
      id: 'ANT-SEED-1',
      fecha: d('2026-08-08'),
      productor: 'Productor Valle Norte',
      rut: '12.345.678-9',
      banco: 'Banco Estado',
      formaPago: 'Transferencia',
      nroDocto: 'ANT-2026-01',
      monto: 1500000,
      saldo: 1500000,
      moneda: 'CLP',
      estado: 'ABIERTO',
      empresaId: EMP,
    },
  });

  await prisma.factorHonorario.create({
    data: {
      id: 'FH-SEED-1',
      factorAnterior: 0.1,
      factorNuevo: 0.1225,
      vigenciaDesde: d('2026-01-01'),
      usuario: 'admin@almahue.local',
      empresaId: EMP,
    },
  });

  await prisma.asiento.create({
    data: {
      id: 'ASI-SEED-MAN-1',
      numero: 'ASI-2026-08-003',
      periodo: '2026-08',
      fecha: d('2026-08-18'),
      tipo: 'MANUAL',
      glosa: 'Asiento manual demo (ajuste menor)',
      debe: 50000,
      haber: 50000,
      estado: 'BORRADOR',
      origen: 'MANUAL',
      lineas: [
        { debe: 50000, haber: 0, cuentaId: gasto?.id, glosa: 'Ajuste' },
        { debe: 0, haber: 50000, cuentaId: caja?.id, glosa: 'Caja' },
      ] as unknown as Prisma.InputJsonValue,
      empresaId: EMP,
    },
  });

  console.log('  demo showcase: comercial/compras/contratistas/contab/tesorería poblados (ago-2026)');
}
