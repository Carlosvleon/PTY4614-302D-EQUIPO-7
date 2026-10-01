/**
 * Maestros + flujos operativos OC (Compras) y OV (Ventas) — contexto Almahue SpA.
 * Invocado desde seed.ts tras showcase y aprobaciones-f2.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { ALM, ALM_NAMES } from './almahue-demo-ids';

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function lineaOc(desc: string, qty: number, precio: number) {
  return {
    descripcion: desc,
    cantidad: qty,
    precioUnitario: precio,
    descuentoPct: 0,
    total: qty * precio,
  };
}

function lineaOvProducto(
  insumoId: string,
  codigo: string,
  desc: string,
  unidad: string,
  bodegaId: string,
  qty: number,
  precio: number,
) {
  return {
    descripcion: `${codigo} · ${desc}`,
    cantidad: qty,
    precioUnitario: precio,
    descuentoPct: 0,
    total: qty * precio,
    tipoLinea: 'PRODUCTO',
    insumoId,
    codigoProducto: codigo,
    unidadMedida: unidad,
    bodegaId,
    splits: [{ bodegaId, cantidad: qty }],
  };
}

/** Bodegas, insumos, proveedores enriquecidos (fruta / packing / agro). */
export async function seedMaestrosFlujoAlmahue(prisma: PrismaClient) {
  await prisma.movimientoBodega.deleteMany({ where: { empresaId: ALM.EMP } });
  await prisma.stockInsumoBodega.deleteMany({ where: { empresaId: ALM.EMP } });
  await prisma.insumo.deleteMany({ where: { empresaId: ALM.EMP } });
  await prisma.bodega.deleteMany({ where: { empresaId: ALM.EMP } });

  const bodegas = [
    { id: ALM.BOD_FRIG, codigo: 'FRIG', nombre: 'Frigorífico exportación' },
    { id: ALM.BOD_PACK, codigo: 'PACK-02', nombre: 'Packing Central' },
    { id: ALM.BOD_MAT, codigo: 'MAT-14', nombre: 'Materiales e insumos packing' },
    { id: ALM.BOD_DESP, codigo: 'DESP-EXP', nombre: 'Despacho exportación' },
  ];
  for (const b of bodegas) {
    await prisma.bodega.create({
      data: { ...b, activa: true, empresaId: ALM.EMP },
    });
  }

  const insumos: Array<{
    id: string;
    codigo: string;
    familia: string;
    subfamilia: string;
    nombre: string;
    unidad: string;
    stock: number;
    costoPromedio: number;
    inventariable: boolean;
  }> = [
    {
      id: ALM.INS_CEREZA,
      codigo: '00000003',
      familia: 'Fruta',
      subfamilia: 'Cereza exportación',
      nombre: 'Cereza 5 kg export',
      unidad: 'CAJ',
      stock: 0,
      costoPromedio: 1850,
      inventariable: true,
    },
    {
      id: ALM.INS_CAJA,
      codigo: '02050001',
      familia: 'Embalaje',
      subfamilia: 'Cajas',
      nombre: 'Caja cartón 5 kg cereza',
      unidad: 'UN',
      stock: 0,
      costoPromedio: 420,
      inventariable: true,
    },
    {
      id: ALM.INS_UREA,
      codigo: 'UREA-46',
      familia: 'Fertilizantes',
      subfamilia: 'Nitrogenados',
      nombre: 'Urea 46%',
      unidad: 'KG',
      stock: 0,
      costoPromedio: 520,
      inventariable: true,
    },
    {
      id: ALM.INS_PALLET,
      codigo: '02080001',
      familia: 'Logística',
      subfamilia: 'Pallets',
      nombre: 'Pallet madera 120x80',
      unidad: 'UN',
      stock: 0,
      costoPromedio: 8500,
      inventariable: true,
    },
  ];
  for (const ins of insumos) {
    await prisma.insumo.create({
      data: { ...ins, empresaId: ALM.EMP },
    });
  }

  const stocks: Array<{ insumoId: string; bodegaId: string; cantidad: number }> = [
    { insumoId: ALM.INS_CEREZA, bodegaId: ALM.BOD_FRIG, cantidad: 5200 },
    { insumoId: ALM.INS_CEREZA, bodegaId: ALM.BOD_DESP, cantidad: 800 },
    { insumoId: ALM.INS_CAJA, bodegaId: ALM.BOD_MAT, cantidad: 15000 },
    { insumoId: ALM.INS_UREA, bodegaId: ALM.BOD_MAT, cantidad: 2400 },
    { insumoId: ALM.INS_PALLET, bodegaId: ALM.BOD_PACK, cantidad: 320 },
  ];
  for (const s of stocks) {
    await prisma.stockInsumoBodega.create({
      data: { ...s, empresaId: ALM.EMP },
    });
    const ins = insumos.find((i) => i.id === s.insumoId)!;
    await prisma.insumo.update({
      where: { id: s.insumoId },
      data: {
        stock: { increment: s.cantidad },
      },
    });
  }

  await prisma.proveedor.deleteMany({ where: { empresaId: ALM.EMP } });
  await prisma.proveedor.createMany({
    data: [
      {
        id: ALM.PROV_AGRO,
        rut: '76.543.210-3',
        razonSocial: ALM_NAMES.PROV_AGRO,
        giro: 'Insumos agrícolas y fertilizantes',
        contacto: 'Ventas campo',
        email: 'ventas@agroinsumosur.cl',
        telefono: '+56 72 255 0100',
        activo: true,
        esProductor: false,
        empresaId: ALM.EMP,
      },
      {
        id: ALM.PROV_PACK,
        rut: '77.111.222-6',
        razonSocial: ALM_NAMES.PROV_PACK,
        giro: 'Envases y embalajes frutícolas',
        contacto: 'Comercial packing',
        email: 'cotizaciones@packagingchile.cl',
        telefono: '+56 2 2345 6789',
        activo: true,
        esProductor: false,
        empresaId: ALM.EMP,
      },
      {
        id: ALM.PROV_QUIM,
        rut: '79.876.543-4',
        razonSocial: ALM_NAMES.PROV_QUIM,
        giro: 'Químicos agrícolas',
        contacto: 'Pedro Mella',
        email: 'pmella@quimicadelvalle.cl',
        activo: true,
        esProductor: false,
        empresaId: ALM.EMP,
      },
    ],
  });

  await prisma.cliente.update({
    where: { id: ALM.CLI_EXPORT },
    data: {
      giro: 'Exportación frutícola',
      tipoCliente: 'EXPORTACION',
      direccion: 'Av. Libertador 1200',
      comuna: 'Santiago',
      ciudad: 'Santiago',
      email: 'comercial@frutasdelsur.cl',
      esProductor: false,
    },
  });
  await prisma.cliente.update({
    where: { id: ALM.CLI_PACKING },
    data: {
      giro: 'Packing y comercialización',
      tipoCliente: 'NACIONAL',
      comuna: 'Santa Cruz',
      ciudad: 'Colchagua',
      esProductor: true,
    },
  });

  console.log(
    `  maestros Almahue: 4 bodegas · ${insumos.length} insumos · 3 proveedores · stock fruta/cajas/urea`,
  );
}

/** Documentos OC + OV en estados del flujo (cadena demo reunión). */
export async function seedFlujoOperativoOcOv(prisma: PrismaClient) {
  await prisma.aprobacionOc.deleteMany({
    where: { empresaId: ALM.EMP, id: { startsWith: 'APROC-ALM-' } },
  });
  await prisma.registroCompra.deleteMany({
    where: { empresaId: ALM.EMP, ocNumero: { startsWith: 'ALM-OC-' } },
  });
  await prisma.recepcionOc.deleteMany({
    where: { empresaId: ALM.EMP, ocNumero: { startsWith: 'ALM-OC-' } },
  });
  await prisma.ordenCompra.deleteMany({
    where: { empresaId: ALM.EMP, numero: { startsWith: 'ALM-OC-' } },
  });
  await prisma.documentoComercial.deleteMany({
    where: { empresaId: ALM.EMP, id: { startsWith: 'DOC-ALM-' } },
  });

  const ccPack = await prisma.centroCosto.findFirst({
    where: { empresaId: ALM.EMP, codigo: 'PACK' },
  });

  // —— Compras: OC wizard (cotización del proveedor = referencia, no documento) ——
  const ocPendLineas = [lineaOc('Urea 46% — temporada 2026', 50, 50000)];
  const ocPendNeto = 2_500_000;

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-ALM-PEND',
      numero: 'ALM-OC-001',
      fecha: d('2026-08-05'),
      proveedor: ALM_NAMES.PROV_AGRO,
      proveedorId: ALM.PROV_AGRO,
      solicitante: 'Carolina Pérez',
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      moneda: 'CLP',
      neto: ocPendNeto,
      afacto: 'AFECTO',
      estado: 'EMITIDO',
      departamento: 'Compras',
      lineas: ocPendLineas as unknown as Prisma.InputJsonValue,
      distribucionCc: ccPack
        ? [{ centroCostoId: ccPack.id, centroCosto: 'PACK · Packing', monto: ocPendNeto, porcentaje: 100 }]
        : undefined,
      empresaId: ALM.EMP,
      aprobaciones: {
        create: {
          id: 'APROC-ALM-OC-PEND',
          ocNumero: 'ALM-OC-001',
          proveedor: ALM_NAMES.PROV_AGRO,
          monto: ocPendNeto,
          solicitante: 'Carolina Pérez',
          aprobadorId: 'U-1',
          aprobadorNombre: 'Admin Almahue',
          estado: 'PENDIENTE',
          fecha: d('2026-08-05'),
          empresaId: ALM.EMP,
        },
      },
    },
  });

  const ocPackLineas = [lineaOc('Cajas cartón 5 kg', 5000, 420)];
  const ocPackNeto = 2_100_000;

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-ALM-APROB',
      numero: 'ALM-OC-002',
      fecha: d('2026-08-06'),
      proveedor: ALM_NAMES.PROV_PACK,
      proveedorId: ALM.PROV_PACK,
      solicitante: 'Jorge Sánchez',
      creadoPorId: 'U-3',
      creadoPorNombre: 'Jorge Sánchez',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      moneda: 'CLP',
      neto: ocPackNeto,
      afacto: 'AFECTO',
      estado: 'APROBADO',
      departamento: 'Packing',
      lineas: ocPackLineas as unknown as Prisma.InputJsonValue,
      empresaId: ALM.EMP,
      aprobaciones: {
        create: {
          id: 'APROC-ALM-OC-OK',
          ocNumero: 'ALM-OC-002',
          proveedor: ALM_NAMES.PROV_PACK,
          monto: ocPackNeto,
          solicitante: 'Jorge Sánchez',
          aprobadorId: 'U-1',
          aprobadorNombre: 'Admin Almahue',
          resueltoPorId: 'U-1',
          resueltoPorNombre: 'Admin Almahue',
          estado: 'APROBADA',
          fecha: d('2026-08-06'),
          empresaId: ALM.EMP,
        },
      },
      recepciones: {
        create: {
          id: 'REC-ALM-BORR',
          ocNumero: 'ALM-OC-002',
          fecha: d('2026-08-09'),
          tcAplicado: 1,
          moneda: 'CLP',
          monto: ocPackNeto,
          estado: 'BORRADOR',
          lineas: ocPackLineas as unknown as Prisma.InputJsonValue,
          empresaId: ALM.EMP,
        },
      },
    },
  });

  const ocUreaLineas = [lineaOc('Urea 46%', 1000, 600)];
  const ocUreaNeto = 600_000;

  await prisma.ordenCompra.create({
    data: {
      id: 'OC-ALM-REC',
      numero: 'ALM-OC-003',
      fecha: d('2026-08-07'),
      proveedor: ALM_NAMES.PROV_AGRO,
      proveedorId: ALM.PROV_AGRO,
      solicitante: 'Carolina Pérez',
      aprobadorId: 'U-1',
      aprobadorNombre: 'Admin Almahue',
      moneda: 'CLP',
      neto: ocUreaNeto,
      afacto: 'AFECTO',
      estado: 'RECEPCIONADA',
      departamento: 'Compras',
      lineas: ocUreaLineas as unknown as Prisma.InputJsonValue,
      empresaId: ALM.EMP,
      aprobaciones: {
        create: {
          id: 'APROC-ALM-OC-REC',
          ocNumero: 'ALM-OC-003',
          proveedor: ALM_NAMES.PROV_AGRO,
          monto: ocUreaNeto,
          solicitante: 'Carolina Pérez',
          aprobadorId: 'U-1',
          aprobadorNombre: 'Admin Almahue',
          resueltoPorId: 'U-1',
          resueltoPorNombre: 'Admin Almahue',
          estado: 'APROBADA',
          fecha: d('2026-08-07'),
          empresaId: ALM.EMP,
        },
      },
      recepciones: {
        create: {
          id: 'REC-ALM-OK',
          ocNumero: 'ALM-OC-003',
          fecha: d('2026-08-10'),
          tcAplicado: 1,
          moneda: 'CLP',
          monto: ocUreaNeto,
          estado: 'CONFIRMADA',
          lineas: ocUreaLineas as unknown as Prisma.InputJsonValue,
          empresaId: ALM.EMP,
        },
      },
      registros: {
        create: {
          id: 'REG-ALM-001',
          ocNumero: 'ALM-OC-003',
          factura: 'FAC-CMP-ALM-001',
          proveedorOc: ALM_NAMES.PROV_AGRO,
          proveedorFactura: ALM_NAMES.PROV_AGRO,
          proveedorId: ALM.PROV_AGRO,
          monto: ocUreaNeto,
          afactoOc: 'AFECTO',
          afactoFactura: 'AFECTO',
          afactoOk: true,
          matchOk: true,
          matchDiff: 0,
          estado: 'CONTABILIZADA',
          lineas: [lineaOc('Urea 46% factura', 1000, 600)] as unknown as Prisma.InputJsonValue,
          empresaId: ALM.EMP,
        },
      },
    },
  });

  // —— Ventas: OV → stock → factura ——
  const ovBajo = lineaOvProducto(
    ALM.INS_CEREZA,
    '00000003',
    'Cereza 5 kg export',
    'CAJ',
    ALM.BOD_FRIG,
    80,
    2400,
  );
  const netoOvBajo = 80 * 2400;

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-ALM-OV-BORR',
      folio: 'ALM-OV-001',
      tipo: 'ORDEN_VENTA',
      cliente: ALM_NAMES.CLI_PACKING,
      clienteId: ALM.CLI_PACKING,
      fecha: d('2026-08-10'),
      neto: netoOvBajo,
      lineas: [ovBajo] as unknown as Prisma.InputJsonValue,
      estado: 'BORRADOR',
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      observaciones: 'Bajo umbral $500k — confirmar sin cadena',
      receptorRut: '76.111.000-4',
      empresaId: ALM.EMP,
    },
  });

  const lineasOvPend = [
    lineaOvProducto(ALM.INS_CEREZA, '00000003', 'Cereza 5 kg export', 'CAJ', ALM.BOD_FRIG, 320, 2450),
    {
      descripcion: 'Flete marítimo exportación',
      cantidad: 1,
      precioUnitario: 850_000,
      descuentoPct: 0,
      total: 850_000,
      tipoLinea: 'FLETE',
    },
  ];
  const netoOvPend = 320 * 2450 + 850_000;

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-ALM-OV-PEND',
      folio: 'ALM-OV-002',
      tipo: 'ORDEN_VENTA',
      cliente: ALM_NAMES.CLI_EXPORT,
      clienteId: ALM.CLI_EXPORT,
      fecha: d('2026-08-11'),
      neto: netoOvPend,
      lineas: lineasOvPend as unknown as Prisma.InputJsonValue,
      estado: 'BORRADOR',
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      observaciones: 'Embarque 446 · broker NAP',
      receptorRut: '76.999.888-8',
      empresaId: ALM.EMP,
    },
  });

  const lineasOvAut = [
    lineaOvProducto(ALM.INS_CEREZA, '00000003', 'Cereza 5 kg export', 'CAJ', ALM.BOD_FRIG, 200, 3000),
  ];
  const netoOvAut = 200 * 3000;

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-ALM-OV-AUT',
      folio: 'ALM-OV-003',
      tipo: 'ORDEN_VENTA',
      cliente: ALM_NAMES.CLI_EXPORT,
      clienteId: ALM.CLI_EXPORT,
      fecha: d('2026-08-12'),
      neto: netoOvAut,
      lineas: lineasOvAut as unknown as Prisma.InputJsonValue,
      estado: 'BORRADOR',
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      empresaId: ALM.EMP,
    },
  });

  const qtyOvConf = 180;
  const lineasOvConf = [
    lineaOvProducto(ALM.INS_CEREZA, '00000003', 'Cereza 5 kg export', 'CAJ', ALM.BOD_FRIG, qtyOvConf, 2800),
  ];
  const netoOvConf = qtyOvConf * 2800;

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-ALM-OV-CONF',
      folio: 'ALM-OV-004',
      tipo: 'ORDEN_VENTA',
      cliente: ALM_NAMES.CLI_EXPORT,
      clienteId: ALM.CLI_EXPORT,
      fecha: d('2026-08-13'),
      neto: netoOvConf,
      lineas: lineasOvConf as unknown as Prisma.InputJsonValue,
      estado: 'CONFIRMADA',
      creadoPorId: 'U-2',
      creadoPorNombre: 'Carolina Pérez',
      observaciones: 'Stock confirmado — listo para facturar',
      empresaId: ALM.EMP,
    },
  });

  await prisma.movimientoBodega.create({
    data: {
      fecha: d('2026-08-13'),
      tipo: 'SALIDA_VENTA',
      estado: 'CONFIRMADO',
      bodega: ALM.BOD_FRIG,
      articulo: '00000003 · Cereza 5 kg export',
      cantidad: qtyOvConf,
      precioUnitario: 2800,
      facturaRef: 'ALM-OV-004',
      nota: 'OV ALM-OV-004',
      insumoId: ALM.INS_CEREZA,
      empresaId: ALM.EMP,
    },
  });
  await prisma.stockInsumoBodega.update({
    where: {
      empresaId_insumoId_bodegaId: {
        empresaId: ALM.EMP,
        insumoId: ALM.INS_CEREZA,
        bodegaId: ALM.BOD_FRIG,
      },
    },
    data: { cantidad: { decrement: qtyOvConf } },
  });

  await prisma.documentoComercial.create({
    data: {
      id: 'DOC-ALM-FAC-BORR',
      folio: 'ALM-FAC-101',
      tipo: 'FACTURA',
      cliente: ALM_NAMES.CLI_EXPORT,
      clienteId: ALM.CLI_EXPORT,
      fecha: d('2026-08-14'),
      neto: netoOvConf,
      iva: Math.round(netoOvConf * 0.19),
      lineas: lineasOvConf as unknown as Prisma.InputJsonValue,
      estado: 'BORRADOR',
      folioOrigen: 'ALM-OV-004',
      documentoOrigenId: 'DOC-ALM-OV-CONF',
      indicadorVenta: 'VENTA',
      receptorRut: '76.999.888-8',
      empresaId: ALM.EMP,
    },
  });

  await prisma.movimientoBodega.create({
    data: {
      fecha: d('2026-08-08'),
      tipo: 'ENTRADA_PROVEEDOR',
      estado: 'CONFIRMADO',
      bodega: ALM.BOD_MAT,
      articulo: 'UREA-46 · Urea 46%',
      cantidad: 1000,
      precioUnitario: 600,
      facturaRef: 'ALM-OC-003',
      nota: 'Recepción OC ALM-OC-003',
      insumoId: ALM.INS_UREA,
      empresaId: ALM.EMP,
    },
  });

  console.log(
    '  flujo OC/OV Almahue: ALM-OC-001…003 · ALM-OV-001…004 · ALM-FAC-101',
  );
}
