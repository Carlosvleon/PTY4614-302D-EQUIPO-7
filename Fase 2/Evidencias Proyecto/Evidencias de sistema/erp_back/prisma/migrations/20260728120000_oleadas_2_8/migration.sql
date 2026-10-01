-- Oleadas 2–8: contratistas ingresos, compras, insumos, contabilidad, tesorería, comercial
SET search_path TO "erp";

-- Enums
DO $$ BEGIN CREATE TYPE "TipoJornadaLabor" AS ENUM ('JORNADA', 'TRATO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoIngresoLabor" AS ENUM ('PENDIENTE', 'ASOCIADO', 'FACTURADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoDocumentoErp" AS ENUM ('BORRADOR', 'EMITIDO', 'APROBADO', 'FACTURADO', 'ANULADO', 'VENCIDO', 'RECHAZADO', 'CONTABILIZADA', 'RECEPCIONADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AfactoOc" AS ENUM ('AFECTO', 'EXENTO', 'MIXTO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoAprobacionOc" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoRecepcionOc" AS ENUM ('BORRADOR', 'CONFIRMADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TipoMovimientoBodega" AS ENUM ('ENTRADA_PROVEEDOR', 'TRASLADO', 'DEVOLUCION_NC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TipoCuentaContable" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoAsiento" AS ENUM ('BORRADOR', 'CONTABILIZADO', 'ANULADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoElementoCosto" AS ENUM ('VIGENTE', 'ANULADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoCartola" AS ENUM ('CARGADA', 'EN_CONCILIACION', 'CERRADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TipoMovimientoFin" AS ENUM ('INGRESO', 'EGRESO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoContableMov" AS ENUM ('PENDIENTE', 'CONTABILIZADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OrigenConciliacion" AS ENUM ('MANUAL', 'AUTOMATICO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoMovConciliacion" AS ENUM ('CONCILIADO', 'PENDIENTE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoAnticipo" AS ENUM ('ABIERTO', 'PARCIAL', 'CERRADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TipoAging" AS ENUM ('POR_COBRAR', 'POR_PAGAR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoAging" AS ENUM ('AL_DIA', 'ATRASADO', 'CRITICO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TipoDocumentoComercial" AS ENUM ('COTIZACION', 'NP', 'OC', 'FACTURA', 'NC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoProspecto" AS ENUM ('NUEVO', 'CONTACTADO', 'CALIFICADO', 'CONVERTIDO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoDte" AS ENUM ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'REINTENTO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EstadoGenericoErp" AS ENUM ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'BORRADOR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "IngresoLaborDiario" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "contratistaId" TEXT NOT NULL,
    "centroCostoId" TEXT NOT NULL,
    "laborId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "tipoJornada" "TipoJornadaLabor" NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoIngresoLabor" NOT NULL DEFAULT 'PENDIENTE',
    "proformaId" TEXT,
    "facturaNumero" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IngresoLaborDiario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PeriodoCierreContratista" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "cerrado" BOOLEAN NOT NULL DEFAULT true,
    "asientoId" TEXT,
    "asientoNumero" TEXT,
    "glosa" TEXT,
    "montoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PeriodoCierreContratista_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrdenCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "proveedor" TEXT NOT NULL,
    "solicitante" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "neto" DECIMAL(18,2) NOT NULL,
    "afacto" "AfactoOc" NOT NULL DEFAULT 'AFECTO',
    "estado" "EstadoDocumentoErp" NOT NULL DEFAULT 'BORRADOR',
    "departamento" TEXT NOT NULL,
    "distribucionCc" JSONB,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AprobacionOc" (
    "id" TEXT NOT NULL,
    "ocId" TEXT NOT NULL,
    "ocNumero" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "solicitante" TEXT NOT NULL,
    "estado" "EstadoAprobacionOc" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMP(3) NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AprobacionOc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecepcionOc" (
    "id" TEXT NOT NULL,
    "ocId" TEXT NOT NULL,
    "ocNumero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tcAplicado" DECIMAL(18,4) NOT NULL,
    "moneda" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoRecepcionOc" NOT NULL DEFAULT 'BORRADOR',
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecepcionOc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RegistroCompra" (
    "id" TEXT NOT NULL,
    "ocId" TEXT,
    "ocNumero" TEXT NOT NULL,
    "factura" TEXT NOT NULL,
    "proveedorOc" TEXT NOT NULL,
    "proveedorFactura" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "afactoOc" "AfactoOc",
    "afactoFactura" "AfactoOc",
    "afactoOk" BOOLEAN NOT NULL DEFAULT true,
    "estado" "EstadoDocumentoErp" NOT NULL DEFAULT 'BORRADOR',
    "asientoId" TEXT,
    "asientoNumero" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RegistroCompra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Insumo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "familia" TEXT NOT NULL,
    "subfamilia" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "stock" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costoPromedio" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Bodega" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bodega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MovimientoBodega" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoMovimientoBodega" NOT NULL,
    "bodega" TEXT NOT NULL,
    "articulo" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precioUnitario" DECIMAL(18,4) NOT NULL,
    "facturaRef" TEXT,
    "nota" TEXT NOT NULL DEFAULT '',
    "insumoId" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MovimientoBodega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CuentaContable" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCuentaContable" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "requiereCc" BOOLEAN NOT NULL DEFAULT false,
    "requiereArea" BOOLEAN NOT NULL DEFAULT false,
    "requiereEspecie" BOOLEAN NOT NULL DEFAULT false,
    "requiereElemento" BOOLEAN NOT NULL DEFAULT false,
    "noImputable" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CuentaContable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ElementoCosto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "vigencia" "EstadoElementoCosto" NOT NULL DEFAULT 'VIGENTE',
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ElementoCosto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FactorHonorario" (
    "id" TEXT NOT NULL,
    "factorAnterior" DECIMAL(18,6) NOT NULL,
    "factorNuevo" DECIMAL(18,6) NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "usuario" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FactorHonorario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Asiento" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "glosa" TEXT NOT NULL,
    "debe" DECIMAL(18,2) NOT NULL,
    "haber" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoAsiento" NOT NULL DEFAULT 'CONTABILIZADO',
    "origen" TEXT,
    "lineas" JSONB NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Asiento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "concepto" TEXT NOT NULL,
    "ingreso" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "egreso" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Pago" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "beneficiario" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "medio" TEXT NOT NULL,
    "estado" "EstadoGenericoErp" NOT NULL DEFAULT 'ACTIVO',
    "tcManual" DECIMAL(18,4),
    "monedaPago" TEXT,
    "monedaFactura" TEXT,
    "diferenciaTc" DECIMAL(18,2),
    "documentosCalce" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CartolaBancaria" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "bancoCodigo" TEXT,
    "fechaCarga" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodo" TEXT NOT NULL,
    "mesContable" TEXT,
    "archivoNombre" TEXT NOT NULL,
    "formato" TEXT NOT NULL DEFAULT 'EXCEL',
    "movimientos" INTEGER NOT NULL DEFAULT 0,
    "montoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estado" "EstadoCartola" NOT NULL DEFAULT 'CARGADA',
    "pendientesContabilizar" INTEGER NOT NULL DEFAULT 0,
    "usuarioCarga" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CartolaBancaria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MovimientoCartola" (
    "id" TEXT NOT NULL,
    "cartolaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "referencia" TEXT NOT NULL,
    "glosa" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "tipo" "TipoMovimientoFin" NOT NULL,
    "estadoContable" "EstadoContableMov" NOT NULL DEFAULT 'PENDIENTE',
    "asientoId" TEXT,
    "asientoNumero" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MovimientoCartola_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Conciliacion" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "movimientos" INTEGER NOT NULL DEFAULT 0,
    "conciliados" INTEGER NOT NULL DEFAULT 0,
    "diferencia" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estado" "EstadoGenericoErp" NOT NULL DEFAULT 'PENDIENTE',
    "asientoId" TEXT,
    "asientoNumero" TEXT,
    "cartolaId" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conciliacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MovimientoConciliacion" (
    "id" TEXT NOT NULL,
    "conciliacionId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "referencia" TEXT NOT NULL,
    "glosa" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "tipo" "TipoMovimientoFin" NOT NULL,
    "origen" "OrigenConciliacion" NOT NULL DEFAULT 'MANUAL',
    "estado" "EstadoMovConciliacion" NOT NULL DEFAULT 'CONCILIADO',
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MovimientoConciliacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AnticipoProductor" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "productor" TEXT NOT NULL,
    "rut" TEXT,
    "banco" TEXT,
    "formaPago" TEXT,
    "codigoFinanciero" TEXT,
    "tipoDocto" TEXT DEFAULT 'ANT',
    "nroDocto" TEXT,
    "nroComprobante" TEXT,
    "fechaVencimiento" TIMESTAMP(3),
    "monto" DECIMAL(18,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "montoUsd" DECIMAL(18,2),
    "montoCalzado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,2) NOT NULL,
    "saldoUsd" DECIMAL(18,2),
    "tc" DECIMAL(18,4),
    "glosa" TEXT,
    "estado" "EstadoAnticipo" NOT NULL DEFAULT 'ABIERTO',
    "documentosCalce" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnticipoProductor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentoAging" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAging" NOT NULL,
    "documento" TEXT NOT NULL,
    "contraparte" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "saldo" DECIMAL(18,2) NOT NULL,
    "diasAtraso" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoAging" NOT NULL DEFAULT 'AL_DIA',
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentoAging_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Presupuesto" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "centroCosto" TEXT NOT NULL,
    "montoPresupuestado" DECIMAL(18,2) NOT NULL,
    "montoEjecutado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estado" "EstadoGenericoErp" NOT NULL DEFAULT 'ACTIVO',
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Cliente" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "credito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vendedor" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Prospecto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "estado" "EstadoProspecto" NOT NULL DEFAULT 'NUEVO',
    "fecha" TIMESTAMP(3) NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Prospecto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentoComercial" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "tipo" "TipoDocumentoComercial" NOT NULL,
    "cliente" TEXT NOT NULL,
    "clienteId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "neto" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoDocumentoErp" NOT NULL DEFAULT 'BORRADOR',
    "fromReversa" BOOLEAN NOT NULL DEFAULT false,
    "folioOrigen" TEXT,
    "asientoOriginal" TEXT,
    "asientoReversador" TEXT,
    "asientoNuevo" TEXT,
    "folioReversador" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentoComercial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DteGoSocket" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoDte" NOT NULL DEFAULT 'BORRADOR',
    "trackId" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DteGoSocket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowConfig" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "montoMin" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "montoMax" DECIMAL(18,2) NOT NULL,
    "aprobadores" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkflowConfig_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE INDEX IF NOT EXISTS "IngresoLaborDiario_empresaId_fecha_idx" ON "IngresoLaborDiario"("empresaId", "fecha");
CREATE INDEX IF NOT EXISTS "IngresoLaborDiario_proformaId_idx" ON "IngresoLaborDiario"("proformaId");
CREATE UNIQUE INDEX IF NOT EXISTS "PeriodoCierreContratista_empresaId_periodo_key" ON "PeriodoCierreContratista"("empresaId", "periodo");
CREATE UNIQUE INDEX IF NOT EXISTS "OrdenCompra_empresaId_numero_key" ON "OrdenCompra"("empresaId", "numero");
CREATE INDEX IF NOT EXISTS "OrdenCompra_empresaId_idx" ON "OrdenCompra"("empresaId");
CREATE INDEX IF NOT EXISTS "AprobacionOc_empresaId_idx" ON "AprobacionOc"("empresaId");
CREATE INDEX IF NOT EXISTS "RecepcionOc_empresaId_idx" ON "RecepcionOc"("empresaId");
CREATE INDEX IF NOT EXISTS "RegistroCompra_empresaId_idx" ON "RegistroCompra"("empresaId");
CREATE UNIQUE INDEX IF NOT EXISTS "Insumo_empresaId_codigo_key" ON "Insumo"("empresaId", "codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "Bodega_empresaId_codigo_key" ON "Bodega"("empresaId", "codigo");
CREATE INDEX IF NOT EXISTS "MovimientoBodega_empresaId_fecha_idx" ON "MovimientoBodega"("empresaId", "fecha");
CREATE UNIQUE INDEX IF NOT EXISTS "CuentaContable_empresaId_codigo_key" ON "CuentaContable"("empresaId", "codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "ElementoCosto_empresaId_codigo_key" ON "ElementoCosto"("empresaId", "codigo");
CREATE INDEX IF NOT EXISTS "FactorHonorario_empresaId_idx" ON "FactorHonorario"("empresaId");
CREATE UNIQUE INDEX IF NOT EXISTS "Asiento_empresaId_numero_key" ON "Asiento"("empresaId", "numero");
CREATE INDEX IF NOT EXISTS "Asiento_empresaId_fecha_idx" ON "Asiento"("empresaId", "fecha");
CREATE INDEX IF NOT EXISTS "MovimientoCaja_empresaId_fecha_idx" ON "MovimientoCaja"("empresaId", "fecha");
CREATE INDEX IF NOT EXISTS "Pago_empresaId_idx" ON "Pago"("empresaId");
CREATE INDEX IF NOT EXISTS "CartolaBancaria_empresaId_idx" ON "CartolaBancaria"("empresaId");
CREATE INDEX IF NOT EXISTS "MovimientoCartola_cartolaId_idx" ON "MovimientoCartola"("cartolaId");
CREATE INDEX IF NOT EXISTS "MovimientoCartola_empresaId_idx" ON "MovimientoCartola"("empresaId");
CREATE INDEX IF NOT EXISTS "Conciliacion_empresaId_idx" ON "Conciliacion"("empresaId");
CREATE INDEX IF NOT EXISTS "MovimientoConciliacion_conciliacionId_idx" ON "MovimientoConciliacion"("conciliacionId");
CREATE INDEX IF NOT EXISTS "AnticipoProductor_empresaId_idx" ON "AnticipoProductor"("empresaId");
CREATE INDEX IF NOT EXISTS "DocumentoAging_empresaId_idx" ON "DocumentoAging"("empresaId");
CREATE INDEX IF NOT EXISTS "Presupuesto_empresaId_idx" ON "Presupuesto"("empresaId");
CREATE UNIQUE INDEX IF NOT EXISTS "Cliente_empresaId_rut_key" ON "Cliente"("empresaId", "rut");
CREATE INDEX IF NOT EXISTS "Prospecto_empresaId_idx" ON "Prospecto"("empresaId");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoComercial_empresaId_folio_key" ON "DocumentoComercial"("empresaId", "folio");
CREATE INDEX IF NOT EXISTS "DocumentoComercial_empresaId_idx" ON "DocumentoComercial"("empresaId");
CREATE INDEX IF NOT EXISTS "DteGoSocket_empresaId_idx" ON "DteGoSocket"("empresaId");
CREATE INDEX IF NOT EXISTS "WorkflowConfig_empresaId_idx" ON "WorkflowConfig"("empresaId");

-- FKs
ALTER TABLE "IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_contratistaId_fkey" FOREIGN KEY ("contratistaId") REFERENCES "Contratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "CentroCosto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_laborId_fkey" FOREIGN KEY ("laborId") REFERENCES "Labor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "ProformaContratista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PeriodoCierreContratista" ADD CONSTRAINT "PeriodoCierreContratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AprobacionOc" ADD CONSTRAINT "AprobacionOc_ocId_fkey" FOREIGN KEY ("ocId") REFERENCES "OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AprobacionOc" ADD CONSTRAINT "AprobacionOc_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecepcionOc" ADD CONSTRAINT "RecepcionOc_ocId_fkey" FOREIGN KEY ("ocId") REFERENCES "OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecepcionOc" ADD CONSTRAINT "RecepcionOc_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistroCompra" ADD CONSTRAINT "RegistroCompra_ocId_fkey" FOREIGN KEY ("ocId") REFERENCES "OrdenCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegistroCompra" ADD CONSTRAINT "RegistroCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimientoBodega" ADD CONSTRAINT "MovimientoBodega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElementoCosto" ADD CONSTRAINT "ElementoCosto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactorHonorario" ADD CONSTRAINT "FactorHonorario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartolaBancaria" ADD CONSTRAINT "CartolaBancaria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimientoCartola" ADD CONSTRAINT "MovimientoCartola_cartolaId_fkey" FOREIGN KEY ("cartolaId") REFERENCES "CartolaBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conciliacion" ADD CONSTRAINT "Conciliacion_cartolaId_fkey" FOREIGN KEY ("cartolaId") REFERENCES "CartolaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conciliacion" ADD CONSTRAINT "Conciliacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimientoConciliacion" ADD CONSTRAINT "MovimientoConciliacion_conciliacionId_fkey" FOREIGN KEY ("conciliacionId") REFERENCES "Conciliacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnticipoProductor" ADD CONSTRAINT "AnticipoProductor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAging" ADD CONSTRAINT "DocumentoAging_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prospecto" ADD CONSTRAINT "Prospecto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoComercial" ADD CONSTRAINT "DocumentoComercial_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentoComercial" ADD CONSTRAINT "DocumentoComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DteGoSocket" ADD CONSTRAINT "DteGoSocket_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowConfig" ADD CONSTRAINT "WorkflowConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
