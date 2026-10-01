-- Modelo PostgreSQL del ERP Almahue.
-- Schema erp. Salida de prisma migrate diff sobre prisma/schema.prisma.
-- 84 tablas y 33 enums.
-- Tablas, indices y tipos quedan calificados en el schema erp.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "erp";

-- CreateEnum
CREATE TYPE "erp"."CatalogoImportacionTipo" AS ENUM ('PLAN_CUENTAS', 'CENTROS_COSTO', 'ELEMENTOS_COSTO', 'AREAS_NEGOCIO', 'CODIGOS_FINANCIEROS');

-- CreateEnum
CREATE TYPE "erp"."EstadoProforma" AS ENUM ('BORRADOR', 'PENDIENTE_APROBACION', 'DEFINITIVA', 'FACTURADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "erp"."TipoJornadaLabor" AS ENUM ('JORNADA', 'TRATO');

-- CreateEnum
CREATE TYPE "erp"."EstadoIngresoLabor" AS ENUM ('PENDIENTE', 'PENDIENTE_APROBACION', 'ASOCIADO', 'FACTURADO');

-- CreateEnum
CREATE TYPE "erp"."EstadoDocumentoErp" AS ENUM ('BORRADOR', 'PENDIENTE_APROBACION', 'AUTORIZADA', 'EMITIDO', 'APROBADO', 'CONFIRMADA', 'FACTURADO', 'ANULADO', 'VENCIDO', 'RECHAZADO', 'CONTABILIZADA', 'RECEPCIONADA');

-- CreateEnum
CREATE TYPE "erp"."AfactoOc" AS ENUM ('AFECTO', 'EXENTO', 'MIXTO');

-- CreateEnum
CREATE TYPE "erp"."AceptacionCompraEstado" AS ENUM ('PENDIENTE', 'ACEPTADA_PLAZO', 'RECLAMADA');

-- CreateEnum
CREATE TYPE "erp"."AceptacionCompraOrigen" AS ENUM ('MANUAL', 'PLAZO_AUTO', 'GOSOCKET');

-- CreateEnum
CREATE TYPE "erp"."GoSocketAceptacionEstado" AS ENUM ('ACEPTADO', 'PENDIENTE', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "erp"."GoSocketRechazoOrigen" AS ENUM ('SII', 'COMERCIAL');

-- CreateEnum
CREATE TYPE "erp"."EstadoAprobacionOc" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'ANULADA', 'OMITIDA');

-- CreateEnum
CREATE TYPE "erp"."EstadoRecepcionOc" AS ENUM ('BORRADOR', 'CONFIRMADA');

-- CreateEnum
CREATE TYPE "erp"."TipoMovimientoBodega" AS ENUM ('ENTRADA_PROVEEDOR', 'TRASLADO', 'DEVOLUCION_NC', 'SALIDA_PROVEEDOR', 'DEVOLUCION', 'SALIDA_VENTA', 'ENTRADA_VENTA_ANULACION');

-- CreateEnum
CREATE TYPE "erp"."EstadoMovimientoBodega" AS ENUM ('BORRADOR', 'CONFIRMADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "erp"."EstadoReservaStock" AS ENUM ('ACTIVA', 'CONSUMIDA', 'LIBERADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "erp"."TipoCuentaContable" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO');

-- CreateEnum
CREATE TYPE "erp"."EstadoAsiento" AS ENUM ('BORRADOR', 'CONTABILIZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "erp"."EstadoPeriodoContable" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "erp"."EstadoElementoCosto" AS ENUM ('VIGENTE', 'ANULADO');

-- CreateEnum
CREATE TYPE "erp"."EstadoCartola" AS ENUM ('CARGADA', 'EN_CONCILIACION', 'CERRADA');

-- CreateEnum
CREATE TYPE "erp"."TipoMovimientoFin" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "erp"."EstadoContableMov" AS ENUM ('PENDIENTE', 'CONTABILIZADO');

-- CreateEnum
CREATE TYPE "erp"."OrigenConciliacion" AS ENUM ('MANUAL', 'AUTOMATICO');

-- CreateEnum
CREATE TYPE "erp"."EstadoMovConciliacion" AS ENUM ('CONCILIADO', 'PENDIENTE');

-- CreateEnum
CREATE TYPE "erp"."EstadoAnticipo" AS ENUM ('ABIERTO', 'PARCIAL', 'CERRADO');

-- CreateEnum
CREATE TYPE "erp"."TipoAging" AS ENUM ('POR_COBRAR', 'POR_PAGAR');

-- CreateEnum
CREATE TYPE "erp"."EstadoAging" AS ENUM ('AL_DIA', 'ATRASADO', 'CRITICO');

-- CreateEnum
CREATE TYPE "erp"."TipoDocumentoComercial" AS ENUM ('COTIZACION', 'NP', 'OC', 'FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA');

-- CreateEnum
CREATE TYPE "erp"."EstadoProspecto" AS ENUM ('NUEVO', 'CONTACTADO', 'CALIFICADO', 'CONVERTIDO');

-- CreateEnum
CREATE TYPE "erp"."TerceroCuentaCorriente" AS ENUM ('CLIENTE', 'PROVEEDOR', 'PRODUCTOR');

-- CreateEnum
CREATE TYPE "erp"."OrigenCuentaCorriente" AS ENUM ('VENTA', 'COMPRA', 'PAGO', 'ANTICIPO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "erp"."EstadoGuiaDespacho" AS ENUM ('BORRADOR', 'EMITIDA', 'FACTURADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "erp"."EstadoGenericoErp" AS ENUM ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'BORRADOR');

-- CreateTable
CREATE TABLE "erp"."Empresa" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "giro" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "direccion" TEXT,
    "comuna" TEXT,
    "ciudad" TEXT,
    "telefono" TEXT,
    "emailContacto" TEXT,
    "representanteLegalNombre" TEXT,
    "representanteLegalRut" TEXT,
    "representanteLegalEmail" TEXT,
    "representanteLegalTelefono" TEXT,
    "logoUrl" TEXT,
    "selloUrl" TEXT,
    "plantillaDoc" JSONB,
    "aceptacionCompraPlazoDias" INTEGER NOT NULL DEFAULT 8,
    "gosocketBillerId" TEXT,
    "gosocketNroResolucion" TEXT,
    "gosocketFechaResolucion" TEXT,
    "gosocketActeco" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Sucursal" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Rol" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "permisos" TEXT[],
    "permisosPantalla" JSONB,
    "aprobarConPin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "claveReversaHash" TEXT,
    "pinAprobacionHash" TEXT,
    "microsoftOid" TEXT,
    "microsoftLinkedAt" TIMESTAMP(3),
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "rolVigenciaDesde" TIMESTAMP(3),
    "rolVigenciaHasta" TIMESTAMP(3),
    "jefeId" TEXT,
    "montoMaxAprobacion" DECIMAL(18,2),
    "empresaId" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."UsuarioEmpresa" (
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioEmpresa_pkey" PRIMARY KEY ("usuarioId","empresaId")
);

-- CreateTable
CREATE TABLE "erp"."CatalogoImportacion" (
    "id" TEXT NOT NULL,
    "tipo" "erp"."CatalogoImportacionTipo" NOT NULL,
    "archivoNombre" TEXT,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "politicas" JSONB,
    "resumen" JSONB,
    "usuarioId" TEXT,
    "usuarioEmail" TEXT,
    "usuarioNombre" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogoImportacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."UiTablePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "visibleColumns" JSONB NOT NULL,
    "columnOrder" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiTablePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."CentroCosto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "contactoEncargado" TEXT,
    "empresaId" TEXT NOT NULL,
    "vigenciaDesde" TIMESTAMP(3),
    "vigenciaHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."AreaNegocio" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AreaNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ConceptoFlujo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptoFlujo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."CodigoFinanciero" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "conceptoId" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodigoFinanciero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Moneda" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "simbolo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "focoReporteria" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Moneda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."UnidadMedida" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnidadMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."TipoDocumento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."IndicadorBc" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "usd" DECIMAL(18,4) NOT NULL,
    "eur" DECIMAL(18,4) NOT NULL,
    "cny" DECIMAL(18,4) NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT 'BCCh',
    "completadoFeriado" BOOLEAN NOT NULL DEFAULT false,
    "origenSync" TEXT,
    "empresaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicadorBc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."SyncBcMeta" (
    "id" TEXT NOT NULL,
    "lastSync" TIMESTAMP(3),
    "autoSync" BOOLEAN NOT NULL DEFAULT false,
    "horaProgramada" TEXT NOT NULL DEFAULT '09:00',
    "horarios" TEXT NOT NULL DEFAULT '09:00',
    "frecuenciaMinutos" INTEGER,
    "ventanaInicio" TEXT NOT NULL DEFAULT '09:00',
    "ventanaFin" TEXT NOT NULL DEFAULT '18:00',
    "diasHabiles" BOOLEAN NOT NULL DEFAULT true,
    "lastCronSlot" TEXT,
    "lastStatus" TEXT,
    "lastError" TEXT,
    "failStreak" INTEGER NOT NULL DEFAULT 0,
    "empresaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncBcMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Contratista" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "especialidad" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "vigenciaHasta" TIMESTAMP(3),
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "direccion" TEXT,
    "ciudad" TEXT,
    "comuna" TEXT,
    "email" TEXT,
    "telefono1" TEXT,
    "telefono2" TEXT,
    "representanteLegal" TEXT,
    "rutRepresentante" TEXT,
    "tipoPago" TEXT,
    "observaciones" JSONB,
    "proveedorId" TEXT,

    CONSTRAINT "Contratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ContratistaVigenciaHistorial" (
    "id" TEXT NOT NULL,
    "contratistaId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "registradoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,

    CONSTRAINT "ContratistaVigenciaHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."TipoContratoContratista" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuentaDebeId" TEXT NOT NULL,
    "cuentaHaberId" TEXT NOT NULL,
    "cuentaAdministracionId" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoContratoContratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Labor" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Labor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Actividad" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."LaborActividad" (
    "laborId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,

    CONSTRAINT "LaborActividad_pkey" PRIMARY KEY ("laborId","actividadId")
);

-- CreateTable
CREATE TABLE "erp"."TarifaContratista" (
    "id" TEXT NOT NULL,
    "contratistaId" TEXT NOT NULL,
    "laborId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "tipoContratoId" TEXT,
    "tarifa" DECIMAL(18,2) NOT NULL,
    "unidad" TEXT NOT NULL,
    "centroCostoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarifaContratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ProformaContratista" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "contratistaId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "montoNeto" DECIMAL(18,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "estado" "erp"."EstadoProforma" NOT NULL DEFAULT 'BORRADOR',
    "tipoContratoId" TEXT,
    "aprobadorId" TEXT,
    "aprobadorNombre" TEXT,
    "aprobacionCadenaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aprobacionPasoActual" INTEGER NOT NULL DEFAULT 1,
    "aprobacionPasosTotal" INTEGER NOT NULL DEFAULT 1,
    "aprobadoPorId" TEXT,
    "aprobadoPorNombre" TEXT,
    "aprobadaAt" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoPorNombre" TEXT,
    "facturaNumeroRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "registroCompraId" TEXT,
    "ordenCompraId" TEXT,

    CONSTRAINT "ProformaContratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."FacturaContratista" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "proformaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "montoNeto" DECIMAL(18,2) NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proformasGrupoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaContratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."IngresoLaborDiario" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "contratistaId" TEXT NOT NULL,
    "centroCostoId" TEXT NOT NULL,
    "laborId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "tipoJornada" "erp"."TipoJornadaLabor" NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "estado" "erp"."EstadoIngresoLabor" NOT NULL DEFAULT 'PENDIENTE',
    "proformaId" TEXT,
    "facturaNumero" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tipoContratoId" TEXT,
    "tarifaId" TEXT,
    "tarifaAplicada" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unidad" TEXT NOT NULL DEFAULT '',
    "precioOverride" BOOLEAN NOT NULL DEFAULT false,
    "motivoOverride" TEXT,
    "aprobadorId" TEXT,
    "aprobadorNombre" TEXT,
    "aprobadoPorId" TEXT,
    "aprobadoPorNombre" TEXT,
    "aprobadaAt" TIMESTAMP(3),

    CONSTRAINT "IngresoLaborDiario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."PeriodoCierreContratista" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "cerrado" BOOLEAN NOT NULL DEFAULT true,
    "asientoId" TEXT,
    "asientoNumero" TEXT,
    "glosa" TEXT,
    "montoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tipoCambio" DECIMAL(18,6),
    "monedaTc" TEXT DEFAULT 'USD',
    "tiposCambio" JSONB,
    "proformaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cerradoAt" TIMESTAMP(3),
    "cerradoPorId" TEXT,
    "cerradoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodoCierreContratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."PeriodoCierreContratistaEvento" (
    "id" TEXT NOT NULL,
    "cierreId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodoCierreContratistaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."AuditoriaContratista" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaContratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."OrdenCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "proveedor" TEXT NOT NULL,
    "proveedorId" TEXT,
    "solicitante" TEXT NOT NULL,
    "creadoPorId" TEXT,
    "creadoPorNombre" TEXT,
    "aprobadorId" TEXT,
    "aprobadorNombre" TEXT,
    "aprobacionCadenaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aprobacionCadena" JSONB,
    "aprobacionPasoActual" INTEGER NOT NULL DEFAULT 1,
    "aprobacionPasosTotal" INTEGER NOT NULL DEFAULT 1,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "neto" DECIMAL(18,2) NOT NULL,
    "afacto" "erp"."AfactoOc" NOT NULL DEFAULT 'AFECTO',
    "estado" "erp"."EstadoDocumentoErp" NOT NULL DEFAULT 'BORRADOR',
    "departamento" TEXT NOT NULL,
    "cuentaContableId" TEXT,
    "centroCostoId" TEXT,
    "elementoCostoId" TEXT,
    "distribucionCc" JSONB,
    "lineas" JSONB,
    "referenciaTipo" TEXT,
    "referenciaFolio" TEXT,
    "referenciaFecha" TIMESTAMP(3),
    "condicionPagoDias" INTEGER,
    "motivoRechazo" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."AprobacionOc" (
    "id" TEXT NOT NULL,
    "ocId" TEXT NOT NULL,
    "ocNumero" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "solicitante" TEXT NOT NULL,
    "aprobadorId" TEXT,
    "aprobadorNombre" TEXT,
    "pasoOrden" INTEGER NOT NULL DEFAULT 1,
    "pasoTotal" INTEGER NOT NULL DEFAULT 1,
    "logica" TEXT NOT NULL DEFAULT 'SIMPLE',
    "resueltoPorId" TEXT,
    "resueltoPorNombre" TEXT,
    "motivoRechazo" TEXT,
    "estado" "erp"."EstadoAprobacionOc" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMP(3) NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AprobacionOc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."RecepcionOc" (
    "id" TEXT NOT NULL,
    "ocId" TEXT NOT NULL,
    "ocNumero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tcAplicado" DECIMAL(18,4) NOT NULL,
    "moneda" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "estado" "erp"."EstadoRecepcionOc" NOT NULL DEFAULT 'BORRADOR',
    "lineas" JSONB,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecepcionOc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."RegistroCompra" (
    "id" TEXT NOT NULL,
    "ocId" TEXT,
    "ocNumero" TEXT NOT NULL,
    "factura" TEXT NOT NULL,
    "proveedorOc" TEXT NOT NULL,
    "proveedorFactura" TEXT NOT NULL,
    "proveedorId" TEXT,
    "monto" DECIMAL(18,2) NOT NULL,
    "afactoOc" "erp"."AfactoOc",
    "afactoFactura" "erp"."AfactoOc",
    "afactoOk" BOOLEAN NOT NULL DEFAULT true,
    "matchOk" BOOLEAN NOT NULL DEFAULT true,
    "matchDiff" DECIMAL(18,2),
    "estado" "erp"."EstadoDocumentoErp" NOT NULL DEFAULT 'BORRADOR',
    "aceptacionEstado" "erp"."AceptacionCompraEstado" NOT NULL DEFAULT 'PENDIENTE',
    "aceptadaAt" TIMESTAMP(3),
    "aceptacionOrigen" "erp"."AceptacionCompraOrigen",
    "aceptadaPorId" TEXT,
    "aceptadaPorNombre" TEXT,
    "asientoId" TEXT,
    "asientoNumero" TEXT,
    "lineas" JSONB,
    "gosocketGlobalDocumentId" TEXT,
    "gosocketCountryDocumentId" TEXT,
    "gosocketEstado" "erp"."GoSocketAceptacionEstado",
    "gosocketAuthorityStatus" TEXT,
    "gosocketRechazoOrigen" "erp"."GoSocketRechazoOrigen",
    "gosocketRechazoMotivo" TEXT,
    "gosocketPdfDisponible" BOOLEAN NOT NULL DEFAULT false,
    "gosocketSincronizadoAt" TIMESTAMP(3),
    "gosocketOcReferencias" JSONB,
    "gosocketRutEmisor" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fechaDocumento" TIMESTAMP(3),
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "origen" TEXT NOT NULL DEFAULT 'COMPRAS',

    CONSTRAINT "RegistroCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Proveedor" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "giro" TEXT,
    "contacto" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "esProductor" BOOLEAN NOT NULL DEFAULT false,
    "condicionPagoDias" INTEGER,
    "condicionIvaDia" INTEGER NOT NULL DEFAULT 10,
    "monedaPago" TEXT NOT NULL DEFAULT 'CLP',
    "solicitadoPor" TEXT,
    "solicitadoNota" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ProveedorCuentaBancaria" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipoCuenta" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "monedaCodigo" TEXT NOT NULL DEFAULT 'CLP',
    "titular" TEXT,
    "rutTitular" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProveedorCuentaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ProveedorContacto" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProveedorContacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ProveedorDireccion" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DESPACHO',
    "linea" TEXT NOT NULL,
    "comuna" TEXT,
    "ciudad" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProveedorDireccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ProveedorCambio" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProveedorCambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Insumo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "familia" TEXT NOT NULL,
    "subfamilia" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "detalle" VARCHAR(1000),
    "unidad" TEXT NOT NULL,
    "stock" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costoPromedio" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "precioCompra" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cuentaContableId" TEXT,
    "inventariable" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."StockInsumoBodega" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "bodegaId" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockInsumoBodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Bodega" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ReservaStock" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "bodegaId" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "estado" "erp"."EstadoReservaStock" NOT NULL DEFAULT 'ACTIVA',
    "venceAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservaStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."MovimientoBodega" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" "erp"."TipoMovimientoBodega" NOT NULL,
    "estado" "erp"."EstadoMovimientoBodega" NOT NULL DEFAULT 'CONFIRMADO',
    "bodega" TEXT NOT NULL,
    "bodegaId" TEXT,
    "bodegaDestino" TEXT,
    "bodegaDestinoId" TEXT,
    "articulo" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precioUnitario" DECIMAL(18,4) NOT NULL,
    "facturaRef" TEXT,
    "nota" TEXT NOT NULL DEFAULT '',
    "insumoId" TEXT,
    "parId" TEXT,
    "centralizadoAsientoId" TEXT,
    "centralizadoAsientoNumero" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimientoBodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."CuentaContable" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigoExcel" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" "erp"."TipoCuentaContable" NOT NULL,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "padreId" TEXT,
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

-- CreateTable
CREATE TABLE "erp"."CuentaCentroCosto" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "centroCostoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaCentroCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."CuentaElementoCosto" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "elementoCostoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaElementoCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."CuentaAreaNegocio" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "areaNegocioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaAreaNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."PeriodoContable" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "fechaDesde" TIMESTAMP(3) NOT NULL,
    "fechaHasta" TIMESTAMP(3) NOT NULL,
    "estado" "erp"."EstadoPeriodoContable" NOT NULL DEFAULT 'ABIERTO',
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodoContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."PeriodoContableEvento" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "estadoAntes" TEXT,
    "estadoDespues" TEXT NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodoContableEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ConfigContableSii" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipoDocumentoSii" TEXT NOT NULL,
    "codigoSii" TEXT,
    "nombre" TEXT NOT NULL,
    "cuentaContableId" TEXT NOT NULL,
    "centroCostoId" TEXT,
    "areaNegocioId" TEXT,
    "elementoCostoId" TEXT,
    "lado" TEXT NOT NULL DEFAULT 'DEBE',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigContableSii_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ElementoCosto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "vigencia" "erp"."EstadoElementoCosto" NOT NULL DEFAULT 'VIGENTE',
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementoCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."FactorHonorario" (
    "id" TEXT NOT NULL,
    "factorAnterior" DECIMAL(18,6) NOT NULL,
    "factorNuevo" DECIMAL(18,6) NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "usuario" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactorHonorario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Asiento" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "periodo" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'MANUAL',
    "glosa" TEXT NOT NULL,
    "debe" DECIMAL(18,2) NOT NULL,
    "haber" DECIMAL(18,2) NOT NULL,
    "estado" "erp"."EstadoAsiento" NOT NULL DEFAULT 'CONTABILIZADO',
    "origen" TEXT,
    "lineas" JSONB NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."MovimientoCaja" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "concepto" TEXT NOT NULL,
    "ingreso" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "egreso" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "banco" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "esApertura" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."AperturaCorreccion" (
    "id" TEXT NOT NULL,
    "movimientoCajaId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "bancoAnterior" TEXT,
    "bancoNuevo" TEXT NOT NULL,
    "monedaAnterior" TEXT NOT NULL,
    "monedaNueva" TEXT NOT NULL,
    "montoAnterior" DECIMAL(18,2) NOT NULL,
    "montoNuevo" DECIMAL(18,2) NOT NULL,
    "fechaAnterior" TIMESTAMP(3) NOT NULL,
    "fechaNueva" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AperturaCorreccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Pago" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "beneficiario" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "medio" TEXT NOT NULL,
    "estado" "erp"."EstadoGenericoErp" NOT NULL DEFAULT 'ACTIVO',
    "tcManual" DECIMAL(18,4),
    "monedaPago" TEXT,
    "monedaFactura" TEXT,
    "diferenciaTc" DECIMAL(18,2),
    "documentosCalce" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'PAGO_TOTAL',
    "movimientoCartolaId" TEXT,
    "proveedorId" TEXT,
    "clienteId" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."PagoTcEvento" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tcAnterior" DECIMAL(18,4),
    "tcNuevo" DECIMAL(18,4) NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT,
    "usuarioEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoTcEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."CartolaBancaria" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "bancoCodigo" TEXT,
    "fechaCarga" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodo" TEXT NOT NULL,
    "mesContable" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "archivoNombre" TEXT NOT NULL,
    "formato" TEXT NOT NULL DEFAULT 'EXCEL',
    "movimientos" INTEGER NOT NULL DEFAULT 0,
    "montoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estado" "erp"."EstadoCartola" NOT NULL DEFAULT 'CARGADA',
    "pendientesContabilizar" INTEGER NOT NULL DEFAULT 0,
    "usuarioCarga" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartolaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."MovimientoCartola" (
    "id" TEXT NOT NULL,
    "cartolaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "referencia" TEXT NOT NULL,
    "glosa" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "tipo" "erp"."TipoMovimientoFin" NOT NULL,
    "estadoContable" "erp"."EstadoContableMov" NOT NULL DEFAULT 'PENDIENTE',
    "asientoId" TEXT,
    "asientoNumero" TEXT,
    "pagoId" TEXT,
    "cuentaContraId" TEXT,
    "destinoTipo" TEXT,
    "codigoFinancieroId" TEXT,
    "tipoDocumento" TEXT,
    "folioDocumento" TEXT,
    "proveedorId" TEXT,
    "clienteId" TEXT,
    "centroCostoId" TEXT,
    "areaNegocioId" TEXT,
    "elementoCostoId" TEXT,
    "nominaSemana" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimientoCartola_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Conciliacion" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "movimientos" INTEGER NOT NULL DEFAULT 0,
    "conciliados" INTEGER NOT NULL DEFAULT 0,
    "diferencia" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estado" "erp"."EstadoGenericoErp" NOT NULL DEFAULT 'PENDIENTE',
    "asientoId" TEXT,
    "asientoNumero" TEXT,
    "cartolaId" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."MovimientoConciliacion" (
    "id" TEXT NOT NULL,
    "conciliacionId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "referencia" TEXT NOT NULL,
    "glosa" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "tipo" "erp"."TipoMovimientoFin" NOT NULL,
    "origen" "erp"."OrigenConciliacion" NOT NULL DEFAULT 'MANUAL',
    "estado" "erp"."EstadoMovConciliacion" NOT NULL DEFAULT 'CONCILIADO',
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimientoConciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."AnticipoProductor" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "productor" TEXT NOT NULL,
    "rut" TEXT,
    "clienteId" TEXT,
    "proveedorId" TEXT,
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
    "estado" "erp"."EstadoAnticipo" NOT NULL DEFAULT 'ABIERTO',
    "documentosCalce" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnticipoProductor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."DocumentoAging" (
    "id" TEXT NOT NULL,
    "tipo" "erp"."TipoAging" NOT NULL,
    "documento" TEXT NOT NULL,
    "contraparte" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "saldo" DECIMAL(18,2) NOT NULL,
    "montoPagado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "diasAtraso" INTEGER NOT NULL DEFAULT 0,
    "estado" "erp"."EstadoAging" NOT NULL DEFAULT 'AL_DIA',
    "documentoComercialId" TEXT,
    "registroCompraId" TEXT,
    "semanaCompromiso" TEXT,
    "vencimientoHistorial" JSONB,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoAging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Presupuesto" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "centroCosto" TEXT NOT NULL,
    "montoPresupuestado" DECIMAL(18,2) NOT NULL,
    "montoEjecutado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estado" "erp"."EstadoGenericoErp" NOT NULL DEFAULT 'ACTIVO',
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Cliente" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "credito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vendedor" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "esProductor" BOOLEAN NOT NULL DEFAULT false,
    "tipoCliente" TEXT,
    "giro" TEXT,
    "direccion" TEXT,
    "comuna" TEXT,
    "ciudad" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "creadoPorId" TEXT,
    "creadoPorNombre" TEXT,
    "solicitadoPor" TEXT,
    "solicitadoNota" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ClienteCuentaBancaria" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipoCuenta" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "monedaCodigo" TEXT NOT NULL DEFAULT 'CLP',
    "titular" TEXT,
    "rutTitular" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteCuentaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ClienteContacto" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteContacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ClienteDireccion" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DESPACHO',
    "linea" TEXT NOT NULL,
    "comuna" TEXT,
    "ciudad" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteDireccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."ClienteCambio" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteCambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Prospecto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "estado" "erp"."EstadoProspecto" NOT NULL DEFAULT 'NUEVO',
    "fecha" TIMESTAMP(3) NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."DocumentoComercial" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "tipo" "erp"."TipoDocumentoComercial" NOT NULL,
    "cliente" TEXT NOT NULL,
    "clienteId" TEXT,
    "proveedorId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "neto" DECIMAL(18,2) NOT NULL,
    "iva" DECIMAL(18,2),
    "lineas" JSONB,
    "estado" "erp"."EstadoDocumentoErp" NOT NULL DEFAULT 'BORRADOR',
    "fromReversa" BOOLEAN NOT NULL DEFAULT false,
    "folioOrigen" TEXT,
    "documentoOrigenId" TEXT,
    "asientoOriginal" TEXT,
    "asientoReversador" TEXT,
    "asientoNuevo" TEXT,
    "folioReversador" TEXT,
    "referenciaTipo" TEXT,
    "referenciaFolio" TEXT,
    "observaciones" TEXT,
    "formaPago" TEXT,
    "fechaVencimiento" TIMESTAMP(3),
    "indicadorVenta" TEXT,
    "descuentoGlobalPct" DECIMAL(5,2),
    "cuentaContableId" TEXT,
    "centroCostoId" TEXT,
    "receptorRut" TEXT,
    "receptorGiro" TEXT,
    "receptorDireccion" TEXT,
    "receptorComuna" TEXT,
    "receptorCiudad" TEXT,
    "monedaCodigo" TEXT,
    "tpoMoneda" TEXT,
    "tipoCambio" DECIMAL(18,6),
    "paisRecepCodigo" TEXT,
    "paisDestino" TEXT,
    "puertoEmbarque" TEXT,
    "puertoDesembarque" TEXT,
    "clausulaVenta" TEXT,
    "viaTransporte" TEXT,
    "modalidadVenta" TEXT,
    "indTraslado" TEXT,
    "bultoTipoCodigo" TEXT,
    "bultoCantidad" INTEGER,
    "bultoMarca" TEXT,
    "montoOtraMoneda" DECIMAL(18,2),
    "montoExentoOtraMoneda" DECIMAL(18,2),
    "referenciaFecha" TIMESTAMP(3),
    "referenciaCod" INTEGER,
    "billingEmissionId" TEXT,
    "billingPartner" TEXT,
    "billingConnectionMode" TEXT,
    "billingStatus" TEXT,
    "folioOficial" TEXT,
    "billingGlobalDocumentId" TEXT,
    "billingDisclaimer" TEXT,
    "billingStub" BOOLEAN NOT NULL DEFAULT false,
    "billingEmittedAt" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoPorNombre" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."CuentaCorrienteMovimiento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "terceroTipo" "erp"."TerceroCuentaCorriente" NOT NULL,
    "terceroId" TEXT NOT NULL,
    "terceroNombre" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "documentoRef" TEXT,
    "documentoTipo" TEXT,
    "debe" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "glosa" TEXT,
    "origen" "erp"."OrigenCuentaCorriente",
    "pagoId" TEXT,
    "documentoComercialId" TEXT,
    "registroCompraId" TEXT,
    "movimientoCartolaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaCorrienteMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."GuiaDespacho" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estado" "erp"."EstadoGuiaDespacho" NOT NULL DEFAULT 'BORRADOR',
    "documentoComercialId" TEXT,
    "glosa" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuiaDespacho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."WorkflowConfig" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "montoMin" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "montoMax" DECIMAL(18,2) NOT NULL,
    "aprobadores" INTEGER NOT NULL DEFAULT 1,
    "aprobadorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."DelegacionAprobacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titularId" TEXT NOT NULL,
    "suplenteId" TEXT NOT NULL,
    "modulo" TEXT,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "motivo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelegacionAprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."GrupoAprobacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "aprobadorInicialId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoAprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."UsuarioGrupoAprobacion" (
    "usuarioId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,

    CONSTRAINT "UsuarioGrupoAprobacion_pkey" PRIMARY KEY ("usuarioId","grupoId")
);

-- CreateTable
CREATE TABLE "erp"."NodoEscalaAprobacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "montoMax" DECIMAL(18,2),
    "escalaAUsuarioId" TEXT,
    "logica" TEXT NOT NULL DEFAULT 'SIMPLE',
    "escalaAId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodoEscalaAprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."NodoAprobador" (
    "id" TEXT NOT NULL,
    "nodoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodoAprobador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."AdminConcepto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminConcepto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."PasoAprobacionDetalle" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "tipoDoc" TEXT NOT NULL,
    "nodoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "comentario" TEXT,
    "respondidoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasoAprobacionDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."Notificacion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empresaId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT,
    "href" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "monto" DECIMAL(18,2),
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_rut_key" ON "erp"."Empresa"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "Sucursal_empresaId_codigo_key" ON "erp"."Sucursal"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_codigo_key" ON "erp"."Rol"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "erp"."Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_username_key" ON "erp"."Usuario"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_microsoftOid_key" ON "erp"."Usuario"("microsoftOid");

-- CreateIndex
CREATE INDEX "UsuarioEmpresa_empresaId_idx" ON "erp"."UsuarioEmpresa"("empresaId");

-- CreateIndex
CREATE INDEX "CatalogoImportacion_empresaId_tipo_createdAt_idx" ON "erp"."CatalogoImportacion"("empresaId", "tipo", "createdAt");

-- CreateIndex
CREATE INDEX "UiTablePreference_userId_idx" ON "erp"."UiTablePreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UiTablePreference_userId_tableKey_key" ON "erp"."UiTablePreference"("userId", "tableKey");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "erp"."RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "erp"."PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CentroCosto_empresaId_codigo_key" ON "erp"."CentroCosto"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "AreaNegocio_empresaId_codigo_key" ON "erp"."AreaNegocio"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "ConceptoFlujo_empresaId_activo_orden_idx" ON "erp"."ConceptoFlujo"("empresaId", "activo", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptoFlujo_empresaId_codigo_key" ON "erp"."ConceptoFlujo"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "CodigoFinanciero_empresaId_activa_idx" ON "erp"."CodigoFinanciero"("empresaId", "activa");

-- CreateIndex
CREATE INDEX "CodigoFinanciero_conceptoId_idx" ON "erp"."CodigoFinanciero"("conceptoId");

-- CreateIndex
CREATE UNIQUE INDEX "CodigoFinanciero_empresaId_codigo_key" ON "erp"."CodigoFinanciero"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Moneda_codigo_key" ON "erp"."Moneda"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadMedida_codigo_key" ON "erp"."UnidadMedida"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "TipoDocumento_codigo_modulo_key" ON "erp"."TipoDocumento"("codigo", "modulo");

-- CreateIndex
CREATE INDEX "IndicadorBc_fecha_idx" ON "erp"."IndicadorBc"("fecha");

-- CreateIndex
CREATE INDEX "IndicadorBc_empresaId_idx" ON "erp"."IndicadorBc"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncBcMeta_empresaId_key" ON "erp"."SyncBcMeta"("empresaId");

-- CreateIndex
CREATE INDEX "Contratista_proveedorId_idx" ON "erp"."Contratista"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "Contratista_empresaId_rut_key" ON "erp"."Contratista"("empresaId", "rut");

-- CreateIndex
CREATE INDEX "ContratistaVigenciaHistorial_contratistaId_registradoAt_idx" ON "erp"."ContratistaVigenciaHistorial"("contratistaId", "registradoAt");

-- CreateIndex
CREATE INDEX "TipoContratoContratista_empresaId_idx" ON "erp"."TipoContratoContratista"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "TipoContratoContratista_empresaId_codigo_key" ON "erp"."TipoContratoContratista"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Labor_empresaId_codigo_key" ON "erp"."Labor"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Actividad_empresaId_codigo_key" ON "erp"."Actividad"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "TarifaContratista_empresaId_idx" ON "erp"."TarifaContratista"("empresaId");

-- CreateIndex
CREATE INDEX "TarifaContratista_contratistaId_idx" ON "erp"."TarifaContratista"("contratistaId");

-- CreateIndex
CREATE INDEX "TarifaContratista_tipoContratoId_idx" ON "erp"."TarifaContratista"("tipoContratoId");

-- CreateIndex
CREATE INDEX "ProformaContratista_empresaId_periodo_idx" ON "erp"."ProformaContratista"("empresaId", "periodo");

-- CreateIndex
CREATE INDEX "ProformaContratista_tipoContratoId_idx" ON "erp"."ProformaContratista"("tipoContratoId");

-- CreateIndex
CREATE INDEX "ProformaContratista_registroCompraId_idx" ON "erp"."ProformaContratista"("registroCompraId");

-- CreateIndex
CREATE INDEX "ProformaContratista_ordenCompraId_idx" ON "erp"."ProformaContratista"("ordenCompraId");

-- CreateIndex
CREATE UNIQUE INDEX "ProformaContratista_empresaId_numero_key" ON "erp"."ProformaContratista"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "FacturaContratista_proformaId_key" ON "erp"."FacturaContratista"("proformaId");

-- CreateIndex
CREATE UNIQUE INDEX "FacturaContratista_empresaId_numero_key" ON "erp"."FacturaContratista"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "IngresoLaborDiario_empresaId_fecha_idx" ON "erp"."IngresoLaborDiario"("empresaId", "fecha");

-- CreateIndex
CREATE INDEX "IngresoLaborDiario_proformaId_idx" ON "erp"."IngresoLaborDiario"("proformaId");

-- CreateIndex
CREATE INDEX "IngresoLaborDiario_tipoContratoId_idx" ON "erp"."IngresoLaborDiario"("tipoContratoId");

-- CreateIndex
CREATE INDEX "IngresoLaborDiario_tarifaId_idx" ON "erp"."IngresoLaborDiario"("tarifaId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodoCierreContratista_empresaId_periodo_key" ON "erp"."PeriodoCierreContratista"("empresaId", "periodo");

-- CreateIndex
CREATE INDEX "PeriodoCierreContratistaEvento_cierreId_createdAt_idx" ON "erp"."PeriodoCierreContratistaEvento"("cierreId", "createdAt");

-- CreateIndex
CREATE INDEX "PeriodoCierreContratistaEvento_empresaId_createdAt_idx" ON "erp"."PeriodoCierreContratistaEvento"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaContratista_empresaId_createdAt_idx" ON "erp"."AuditoriaContratista"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaContratista_entidad_entidadId_idx" ON "erp"."AuditoriaContratista"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "OrdenCompra_empresaId_idx" ON "erp"."OrdenCompra"("empresaId");

-- CreateIndex
CREATE INDEX "OrdenCompra_proveedorId_idx" ON "erp"."OrdenCompra"("proveedorId");

-- CreateIndex
CREATE INDEX "OrdenCompra_aprobadorId_idx" ON "erp"."OrdenCompra"("aprobadorId");

-- CreateIndex
CREATE INDEX "OrdenCompra_creadoPorId_idx" ON "erp"."OrdenCompra"("creadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompra_empresaId_numero_key" ON "erp"."OrdenCompra"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "AprobacionOc_empresaId_idx" ON "erp"."AprobacionOc"("empresaId");

-- CreateIndex
CREATE INDEX "AprobacionOc_aprobadorId_idx" ON "erp"."AprobacionOc"("aprobadorId");

-- CreateIndex
CREATE INDEX "RecepcionOc_empresaId_idx" ON "erp"."RecepcionOc"("empresaId");

-- CreateIndex
CREATE INDEX "RegistroCompra_empresaId_idx" ON "erp"."RegistroCompra"("empresaId");

-- CreateIndex
CREATE INDEX "RegistroCompra_proveedorId_idx" ON "erp"."RegistroCompra"("proveedorId");

-- CreateIndex
CREATE INDEX "RegistroCompra_gosocketGlobalDocumentId_idx" ON "erp"."RegistroCompra"("gosocketGlobalDocumentId");

-- CreateIndex
CREATE INDEX "Proveedor_empresaId_idx" ON "erp"."Proveedor"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_empresaId_rut_key" ON "erp"."Proveedor"("empresaId", "rut");

-- CreateIndex
CREATE INDEX "ProveedorCuentaBancaria_empresaId_idx" ON "erp"."ProveedorCuentaBancaria"("empresaId");

-- CreateIndex
CREATE INDEX "ProveedorCuentaBancaria_proveedorId_idx" ON "erp"."ProveedorCuentaBancaria"("proveedorId");

-- CreateIndex
CREATE INDEX "ProveedorContacto_empresaId_idx" ON "erp"."ProveedorContacto"("empresaId");

-- CreateIndex
CREATE INDEX "ProveedorContacto_proveedorId_idx" ON "erp"."ProveedorContacto"("proveedorId");

-- CreateIndex
CREATE INDEX "ProveedorDireccion_empresaId_idx" ON "erp"."ProveedorDireccion"("empresaId");

-- CreateIndex
CREATE INDEX "ProveedorDireccion_proveedorId_idx" ON "erp"."ProveedorDireccion"("proveedorId");

-- CreateIndex
CREATE INDEX "ProveedorCambio_empresaId_idx" ON "erp"."ProveedorCambio"("empresaId");

-- CreateIndex
CREATE INDEX "ProveedorCambio_proveedorId_idx" ON "erp"."ProveedorCambio"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "Insumo_empresaId_codigo_key" ON "erp"."Insumo"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "StockInsumoBodega_empresaId_insumoId_idx" ON "erp"."StockInsumoBodega"("empresaId", "insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "StockInsumoBodega_empresaId_insumoId_bodegaId_key" ON "erp"."StockInsumoBodega"("empresaId", "insumoId", "bodegaId");

-- CreateIndex
CREATE UNIQUE INDEX "Bodega_empresaId_codigo_key" ON "erp"."Bodega"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "ReservaStock_empresaId_insumoId_bodegaId_estado_idx" ON "erp"."ReservaStock"("empresaId", "insumoId", "bodegaId", "estado");

-- CreateIndex
CREATE INDEX "ReservaStock_empresaId_documentoId_idx" ON "erp"."ReservaStock"("empresaId", "documentoId");

-- CreateIndex
CREATE INDEX "ReservaStock_venceAt_idx" ON "erp"."ReservaStock"("venceAt");

-- CreateIndex
CREATE INDEX "MovimientoBodega_empresaId_fecha_idx" ON "erp"."MovimientoBodega"("empresaId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoBodega_bodegaId_idx" ON "erp"."MovimientoBodega"("bodegaId");

-- CreateIndex
CREATE INDEX "MovimientoBodega_insumoId_idx" ON "erp"."MovimientoBodega"("insumoId");

-- CreateIndex
CREATE INDEX "CuentaContable_empresaId_padreId_idx" ON "erp"."CuentaContable"("empresaId", "padreId");

-- CreateIndex
CREATE INDEX "CuentaContable_empresaId_codigoExcel_idx" ON "erp"."CuentaContable"("empresaId", "codigoExcel");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaContable_empresaId_codigo_key" ON "erp"."CuentaContable"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "CuentaCentroCosto_empresaId_idx" ON "erp"."CuentaCentroCosto"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaCentroCosto_cuentaId_centroCostoId_key" ON "erp"."CuentaCentroCosto"("cuentaId", "centroCostoId");

-- CreateIndex
CREATE INDEX "CuentaElementoCosto_empresaId_idx" ON "erp"."CuentaElementoCosto"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaElementoCosto_cuentaId_elementoCostoId_key" ON "erp"."CuentaElementoCosto"("cuentaId", "elementoCostoId");

-- CreateIndex
CREATE INDEX "CuentaAreaNegocio_empresaId_idx" ON "erp"."CuentaAreaNegocio"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaAreaNegocio_cuentaId_areaNegocioId_key" ON "erp"."CuentaAreaNegocio"("cuentaId", "areaNegocioId");

-- CreateIndex
CREATE INDEX "PeriodoContable_empresaId_estado_idx" ON "erp"."PeriodoContable"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodoContable_empresaId_codigo_key" ON "erp"."PeriodoContable"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "PeriodoContableEvento_periodoId_createdAt_idx" ON "erp"."PeriodoContableEvento"("periodoId", "createdAt");

-- CreateIndex
CREATE INDEX "PeriodoContableEvento_empresaId_createdAt_idx" ON "erp"."PeriodoContableEvento"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "ConfigContableSii_empresaId_idx" ON "erp"."ConfigContableSii"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigContableSii_empresaId_tipoDocumentoSii_key" ON "erp"."ConfigContableSii"("empresaId", "tipoDocumentoSii");

-- CreateIndex
CREATE UNIQUE INDEX "ElementoCosto_empresaId_codigo_key" ON "erp"."ElementoCosto"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "FactorHonorario_empresaId_idx" ON "erp"."FactorHonorario"("empresaId");

-- CreateIndex
CREATE INDEX "Asiento_empresaId_fecha_idx" ON "erp"."Asiento"("empresaId", "fecha");

-- CreateIndex
CREATE INDEX "Asiento_empresaId_periodo_idx" ON "erp"."Asiento"("empresaId", "periodo");

-- CreateIndex
CREATE INDEX "Asiento_empresaId_origen_idx" ON "erp"."Asiento"("empresaId", "origen");

-- CreateIndex
CREATE UNIQUE INDEX "Asiento_empresaId_numero_key" ON "erp"."Asiento"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "MovimientoCaja_empresaId_fecha_idx" ON "erp"."MovimientoCaja"("empresaId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoCaja_empresaId_banco_moneda_idx" ON "erp"."MovimientoCaja"("empresaId", "banco", "moneda");

-- CreateIndex
CREATE INDEX "AperturaCorreccion_movimientoCajaId_createdAt_idx" ON "erp"."AperturaCorreccion"("movimientoCajaId", "createdAt");

-- CreateIndex
CREATE INDEX "AperturaCorreccion_empresaId_idx" ON "erp"."AperturaCorreccion"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_movimientoCartolaId_key" ON "erp"."Pago"("movimientoCartolaId");

-- CreateIndex
CREATE INDEX "Pago_empresaId_idx" ON "erp"."Pago"("empresaId");

-- CreateIndex
CREATE INDEX "Pago_proveedorId_idx" ON "erp"."Pago"("proveedorId");

-- CreateIndex
CREATE INDEX "Pago_clienteId_idx" ON "erp"."Pago"("clienteId");

-- CreateIndex
CREATE INDEX "PagoTcEvento_pagoId_createdAt_idx" ON "erp"."PagoTcEvento"("pagoId", "createdAt");

-- CreateIndex
CREATE INDEX "PagoTcEvento_empresaId_idx" ON "erp"."PagoTcEvento"("empresaId");

-- CreateIndex
CREATE INDEX "CartolaBancaria_empresaId_idx" ON "erp"."CartolaBancaria"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCartola_pagoId_key" ON "erp"."MovimientoCartola"("pagoId");

-- CreateIndex
CREATE INDEX "MovimientoCartola_cartolaId_idx" ON "erp"."MovimientoCartola"("cartolaId");

-- CreateIndex
CREATE INDEX "MovimientoCartola_empresaId_idx" ON "erp"."MovimientoCartola"("empresaId");

-- CreateIndex
CREATE INDEX "MovimientoCartola_codigoFinancieroId_idx" ON "erp"."MovimientoCartola"("codigoFinancieroId");

-- CreateIndex
CREATE INDEX "MovimientoCartola_empresaId_nominaSemana_idx" ON "erp"."MovimientoCartola"("empresaId", "nominaSemana");

-- CreateIndex
CREATE INDEX "Conciliacion_empresaId_idx" ON "erp"."Conciliacion"("empresaId");

-- CreateIndex
CREATE INDEX "MovimientoConciliacion_conciliacionId_idx" ON "erp"."MovimientoConciliacion"("conciliacionId");

-- CreateIndex
CREATE INDEX "AnticipoProductor_empresaId_idx" ON "erp"."AnticipoProductor"("empresaId");

-- CreateIndex
CREATE INDEX "AnticipoProductor_clienteId_idx" ON "erp"."AnticipoProductor"("clienteId");

-- CreateIndex
CREATE INDEX "AnticipoProductor_proveedorId_idx" ON "erp"."AnticipoProductor"("proveedorId");

-- CreateIndex
CREATE INDEX "DocumentoAging_empresaId_idx" ON "erp"."DocumentoAging"("empresaId");

-- CreateIndex
CREATE INDEX "DocumentoAging_documentoComercialId_idx" ON "erp"."DocumentoAging"("documentoComercialId");

-- CreateIndex
CREATE INDEX "DocumentoAging_registroCompraId_idx" ON "erp"."DocumentoAging"("registroCompraId");

-- CreateIndex
CREATE INDEX "Presupuesto_empresaId_idx" ON "erp"."Presupuesto"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_empresaId_rut_key" ON "erp"."Cliente"("empresaId", "rut");

-- CreateIndex
CREATE INDEX "ClienteCuentaBancaria_empresaId_idx" ON "erp"."ClienteCuentaBancaria"("empresaId");

-- CreateIndex
CREATE INDEX "ClienteCuentaBancaria_clienteId_idx" ON "erp"."ClienteCuentaBancaria"("clienteId");

-- CreateIndex
CREATE INDEX "ClienteContacto_empresaId_idx" ON "erp"."ClienteContacto"("empresaId");

-- CreateIndex
CREATE INDEX "ClienteContacto_clienteId_idx" ON "erp"."ClienteContacto"("clienteId");

-- CreateIndex
CREATE INDEX "ClienteDireccion_empresaId_idx" ON "erp"."ClienteDireccion"("empresaId");

-- CreateIndex
CREATE INDEX "ClienteDireccion_clienteId_idx" ON "erp"."ClienteDireccion"("clienteId");

-- CreateIndex
CREATE INDEX "ClienteCambio_empresaId_idx" ON "erp"."ClienteCambio"("empresaId");

-- CreateIndex
CREATE INDEX "ClienteCambio_clienteId_idx" ON "erp"."ClienteCambio"("clienteId");

-- CreateIndex
CREATE INDEX "Prospecto_empresaId_idx" ON "erp"."Prospecto"("empresaId");

-- CreateIndex
CREATE INDEX "DocumentoComercial_empresaId_idx" ON "erp"."DocumentoComercial"("empresaId");

-- CreateIndex
CREATE INDEX "DocumentoComercial_documentoOrigenId_idx" ON "erp"."DocumentoComercial"("documentoOrigenId");

-- CreateIndex
CREATE INDEX "DocumentoComercial_billingEmissionId_idx" ON "erp"."DocumentoComercial"("billingEmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoComercial_empresaId_folio_key" ON "erp"."DocumentoComercial"("empresaId", "folio");

-- CreateIndex
CREATE INDEX "CuentaCorrienteMovimiento_empresaId_terceroTipo_terceroId_idx" ON "erp"."CuentaCorrienteMovimiento"("empresaId", "terceroTipo", "terceroId");

-- CreateIndex
CREATE INDEX "CuentaCorrienteMovimiento_empresaId_fecha_idx" ON "erp"."CuentaCorrienteMovimiento"("empresaId", "fecha");

-- CreateIndex
CREATE INDEX "GuiaDespacho_empresaId_idx" ON "erp"."GuiaDespacho"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "GuiaDespacho_empresaId_folio_key" ON "erp"."GuiaDespacho"("empresaId", "folio");

-- CreateIndex
CREATE INDEX "WorkflowConfig_empresaId_idx" ON "erp"."WorkflowConfig"("empresaId");

-- CreateIndex
CREATE INDEX "WorkflowConfig_modulo_idx" ON "erp"."WorkflowConfig"("modulo");

-- CreateIndex
CREATE INDEX "DelegacionAprobacion_empresaId_titularId_idx" ON "erp"."DelegacionAprobacion"("empresaId", "titularId");

-- CreateIndex
CREATE INDEX "DelegacionAprobacion_empresaId_vigenciaDesde_vigenciaHasta_idx" ON "erp"."DelegacionAprobacion"("empresaId", "vigenciaDesde", "vigenciaHasta");

-- CreateIndex
CREATE INDEX "GrupoAprobacion_empresaId_modulo_idx" ON "erp"."GrupoAprobacion"("empresaId", "modulo");

-- CreateIndex
CREATE INDEX "UsuarioGrupoAprobacion_grupoId_idx" ON "erp"."UsuarioGrupoAprobacion"("grupoId");

-- CreateIndex
CREATE INDEX "NodoEscalaAprobacion_grupoId_idx" ON "erp"."NodoEscalaAprobacion"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "NodoEscalaAprobacion_empresaId_modulo_grupoId_usuarioId_key" ON "erp"."NodoEscalaAprobacion"("empresaId", "modulo", "grupoId", "usuarioId");

-- CreateIndex
CREATE INDEX "NodoAprobador_nodoId_idx" ON "erp"."NodoAprobador"("nodoId");

-- CreateIndex
CREATE UNIQUE INDEX "NodoAprobador_nodoId_usuarioId_key" ON "erp"."NodoAprobador"("nodoId", "usuarioId");

-- CreateIndex
CREATE INDEX "AdminConcepto_empresaId_modulo_idx" ON "erp"."AdminConcepto"("empresaId", "modulo");

-- CreateIndex
CREATE UNIQUE INDEX "AdminConcepto_empresaId_usuarioId_modulo_key" ON "erp"."AdminConcepto"("empresaId", "usuarioId", "modulo");

-- CreateIndex
CREATE INDEX "PasoAprobacionDetalle_documentoId_tipoDoc_nodoId_idx" ON "erp"."PasoAprobacionDetalle"("documentoId", "tipoDoc", "nodoId");

-- CreateIndex
CREATE UNIQUE INDEX "PasoAprobacionDetalle_documentoId_tipoDoc_nodoId_usuarioId_key" ON "erp"."PasoAprobacionDetalle"("documentoId", "tipoDoc", "nodoId", "usuarioId");

-- CreateIndex
CREATE INDEX "Notificacion_userId_leida_createdAt_idx" ON "erp"."Notificacion"("userId", "leida", "createdAt");

-- CreateIndex
CREATE INDEX "Notificacion_empresaId_idx" ON "erp"."Notificacion"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Notificacion_userId_refKey_key" ON "erp"."Notificacion"("userId", "refKey");

-- AddForeignKey
ALTER TABLE "erp"."Sucursal" ADD CONSTRAINT "Sucursal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Usuario" ADD CONSTRAINT "Usuario_jefeId_fkey" FOREIGN KEY ("jefeId") REFERENCES "erp"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "erp"."Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CatalogoImportacion" ADD CONSTRAINT "CatalogoImportacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CatalogoImportacion" ADD CONSTRAINT "CatalogoImportacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."UiTablePreference" ADD CONSTRAINT "UiTablePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CentroCosto" ADD CONSTRAINT "CentroCosto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AreaNegocio" ADD CONSTRAINT "AreaNegocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ConceptoFlujo" ADD CONSTRAINT "ConceptoFlujo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CodigoFinanciero" ADD CONSTRAINT "CodigoFinanciero_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "erp"."ConceptoFlujo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CodigoFinanciero" ADD CONSTRAINT "CodigoFinanciero_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IndicadorBc" ADD CONSTRAINT "IndicadorBc_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."SyncBcMeta" ADD CONSTRAINT "SyncBcMeta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Contratista" ADD CONSTRAINT "Contratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Contratista" ADD CONSTRAINT "Contratista_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ContratistaVigenciaHistorial" ADD CONSTRAINT "ContratistaVigenciaHistorial_contratistaId_fkey" FOREIGN KEY ("contratistaId") REFERENCES "erp"."Contratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ContratistaVigenciaHistorial" ADD CONSTRAINT "ContratistaVigenciaHistorial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TipoContratoContratista" ADD CONSTRAINT "TipoContratoContratista_cuentaDebeId_fkey" FOREIGN KEY ("cuentaDebeId") REFERENCES "erp"."CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TipoContratoContratista" ADD CONSTRAINT "TipoContratoContratista_cuentaHaberId_fkey" FOREIGN KEY ("cuentaHaberId") REFERENCES "erp"."CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TipoContratoContratista" ADD CONSTRAINT "TipoContratoContratista_cuentaAdministracionId_fkey" FOREIGN KEY ("cuentaAdministracionId") REFERENCES "erp"."CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TipoContratoContratista" ADD CONSTRAINT "TipoContratoContratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Labor" ADD CONSTRAINT "Labor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Actividad" ADD CONSTRAINT "Actividad_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."LaborActividad" ADD CONSTRAINT "LaborActividad_laborId_fkey" FOREIGN KEY ("laborId") REFERENCES "erp"."Labor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."LaborActividad" ADD CONSTRAINT "LaborActividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "erp"."Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TarifaContratista" ADD CONSTRAINT "TarifaContratista_contratistaId_fkey" FOREIGN KEY ("contratistaId") REFERENCES "erp"."Contratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TarifaContratista" ADD CONSTRAINT "TarifaContratista_laborId_fkey" FOREIGN KEY ("laborId") REFERENCES "erp"."Labor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TarifaContratista" ADD CONSTRAINT "TarifaContratista_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "erp"."Actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TarifaContratista" ADD CONSTRAINT "TarifaContratista_tipoContratoId_fkey" FOREIGN KEY ("tipoContratoId") REFERENCES "erp"."TipoContratoContratista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TarifaContratista" ADD CONSTRAINT "TarifaContratista_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "erp"."CentroCosto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."TarifaContratista" ADD CONSTRAINT "TarifaContratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProformaContratista" ADD CONSTRAINT "ProformaContratista_contratistaId_fkey" FOREIGN KEY ("contratistaId") REFERENCES "erp"."Contratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProformaContratista" ADD CONSTRAINT "ProformaContratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProformaContratista" ADD CONSTRAINT "ProformaContratista_tipoContratoId_fkey" FOREIGN KEY ("tipoContratoId") REFERENCES "erp"."TipoContratoContratista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProformaContratista" ADD CONSTRAINT "ProformaContratista_registroCompraId_fkey" FOREIGN KEY ("registroCompraId") REFERENCES "erp"."RegistroCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProformaContratista" ADD CONSTRAINT "ProformaContratista_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "erp"."OrdenCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."FacturaContratista" ADD CONSTRAINT "FacturaContratista_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "erp"."ProformaContratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_contratistaId_fkey" FOREIGN KEY ("contratistaId") REFERENCES "erp"."Contratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "erp"."CentroCosto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_laborId_fkey" FOREIGN KEY ("laborId") REFERENCES "erp"."Labor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "erp"."Actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "erp"."ProformaContratista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_tipoContratoId_fkey" FOREIGN KEY ("tipoContratoId") REFERENCES "erp"."TipoContratoContratista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."IngresoLaborDiario" ADD CONSTRAINT "IngresoLaborDiario_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "erp"."TarifaContratista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."PeriodoCierreContratista" ADD CONSTRAINT "PeriodoCierreContratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."PeriodoCierreContratistaEvento" ADD CONSTRAINT "PeriodoCierreContratistaEvento_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "erp"."PeriodoCierreContratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."PeriodoCierreContratistaEvento" ADD CONSTRAINT "PeriodoCierreContratistaEvento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AuditoriaContratista" ADD CONSTRAINT "AuditoriaContratista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."OrdenCompra" ADD CONSTRAINT "OrdenCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."OrdenCompra" ADD CONSTRAINT "OrdenCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AprobacionOc" ADD CONSTRAINT "AprobacionOc_ocId_fkey" FOREIGN KEY ("ocId") REFERENCES "erp"."OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AprobacionOc" ADD CONSTRAINT "AprobacionOc_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."RecepcionOc" ADD CONSTRAINT "RecepcionOc_ocId_fkey" FOREIGN KEY ("ocId") REFERENCES "erp"."OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."RecepcionOc" ADD CONSTRAINT "RecepcionOc_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."RegistroCompra" ADD CONSTRAINT "RegistroCompra_ocId_fkey" FOREIGN KEY ("ocId") REFERENCES "erp"."OrdenCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."RegistroCompra" ADD CONSTRAINT "RegistroCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."RegistroCompra" ADD CONSTRAINT "RegistroCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Proveedor" ADD CONSTRAINT "Proveedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProveedorCuentaBancaria" ADD CONSTRAINT "ProveedorCuentaBancaria_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProveedorContacto" ADD CONSTRAINT "ProveedorContacto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProveedorDireccion" ADD CONSTRAINT "ProveedorDireccion_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ProveedorCambio" ADD CONSTRAINT "ProveedorCambio_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Insumo" ADD CONSTRAINT "Insumo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."StockInsumoBodega" ADD CONSTRAINT "StockInsumoBodega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."StockInsumoBodega" ADD CONSTRAINT "StockInsumoBodega_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "erp"."Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."StockInsumoBodega" ADD CONSTRAINT "StockInsumoBodega_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "erp"."Bodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Bodega" ADD CONSTRAINT "Bodega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ReservaStock" ADD CONSTRAINT "ReservaStock_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ReservaStock" ADD CONSTRAINT "ReservaStock_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "erp"."DocumentoComercial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ReservaStock" ADD CONSTRAINT "ReservaStock_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "erp"."Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ReservaStock" ADD CONSTRAINT "ReservaStock_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "erp"."Bodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoBodega" ADD CONSTRAINT "MovimientoBodega_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "erp"."Bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoBodega" ADD CONSTRAINT "MovimientoBodega_bodegaDestinoId_fkey" FOREIGN KEY ("bodegaDestinoId") REFERENCES "erp"."Bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoBodega" ADD CONSTRAINT "MovimientoBodega_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "erp"."Insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoBodega" ADD CONSTRAINT "MovimientoBodega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaContable" ADD CONSTRAINT "CuentaContable_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "erp"."CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaContable" ADD CONSTRAINT "CuentaContable_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaCentroCosto" ADD CONSTRAINT "CuentaCentroCosto_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "erp"."CuentaContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaCentroCosto" ADD CONSTRAINT "CuentaCentroCosto_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "erp"."CentroCosto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaElementoCosto" ADD CONSTRAINT "CuentaElementoCosto_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "erp"."CuentaContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaElementoCosto" ADD CONSTRAINT "CuentaElementoCosto_elementoCostoId_fkey" FOREIGN KEY ("elementoCostoId") REFERENCES "erp"."ElementoCosto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaAreaNegocio" ADD CONSTRAINT "CuentaAreaNegocio_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "erp"."CuentaContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaAreaNegocio" ADD CONSTRAINT "CuentaAreaNegocio_areaNegocioId_fkey" FOREIGN KEY ("areaNegocioId") REFERENCES "erp"."AreaNegocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."PeriodoContable" ADD CONSTRAINT "PeriodoContable_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."PeriodoContableEvento" ADD CONSTRAINT "PeriodoContableEvento_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "erp"."PeriodoContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ConfigContableSii" ADD CONSTRAINT "ConfigContableSii_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ConfigContableSii" ADD CONSTRAINT "ConfigContableSii_cuentaContableId_fkey" FOREIGN KEY ("cuentaContableId") REFERENCES "erp"."CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ElementoCosto" ADD CONSTRAINT "ElementoCosto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."FactorHonorario" ADD CONSTRAINT "FactorHonorario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Asiento" ADD CONSTRAINT "Asiento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AperturaCorreccion" ADD CONSTRAINT "AperturaCorreccion_movimientoCajaId_fkey" FOREIGN KEY ("movimientoCajaId") REFERENCES "erp"."MovimientoCaja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AperturaCorreccion" ADD CONSTRAINT "AperturaCorreccion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Pago" ADD CONSTRAINT "Pago_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Pago" ADD CONSTRAINT "Pago_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Pago" ADD CONSTRAINT "Pago_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."PagoTcEvento" ADD CONSTRAINT "PagoTcEvento_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "erp"."Pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."PagoTcEvento" ADD CONSTRAINT "PagoTcEvento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CartolaBancaria" ADD CONSTRAINT "CartolaBancaria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoCartola" ADD CONSTRAINT "MovimientoCartola_cartolaId_fkey" FOREIGN KEY ("cartolaId") REFERENCES "erp"."CartolaBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoCartola" ADD CONSTRAINT "MovimientoCartola_cuentaContraId_fkey" FOREIGN KEY ("cuentaContraId") REFERENCES "erp"."CuentaContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoCartola" ADD CONSTRAINT "MovimientoCartola_codigoFinancieroId_fkey" FOREIGN KEY ("codigoFinancieroId") REFERENCES "erp"."CodigoFinanciero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoCartola" ADD CONSTRAINT "MovimientoCartola_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoCartola" ADD CONSTRAINT "MovimientoCartola_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Conciliacion" ADD CONSTRAINT "Conciliacion_cartolaId_fkey" FOREIGN KEY ("cartolaId") REFERENCES "erp"."CartolaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Conciliacion" ADD CONSTRAINT "Conciliacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."MovimientoConciliacion" ADD CONSTRAINT "MovimientoConciliacion_conciliacionId_fkey" FOREIGN KEY ("conciliacionId") REFERENCES "erp"."Conciliacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AnticipoProductor" ADD CONSTRAINT "AnticipoProductor_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AnticipoProductor" ADD CONSTRAINT "AnticipoProductor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AnticipoProductor" ADD CONSTRAINT "AnticipoProductor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."DocumentoAging" ADD CONSTRAINT "DocumentoAging_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Presupuesto" ADD CONSTRAINT "Presupuesto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ClienteCuentaBancaria" ADD CONSTRAINT "ClienteCuentaBancaria_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ClienteContacto" ADD CONSTRAINT "ClienteContacto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ClienteDireccion" ADD CONSTRAINT "ClienteDireccion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ClienteCambio" ADD CONSTRAINT "ClienteCambio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Prospecto" ADD CONSTRAINT "Prospecto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."DocumentoComercial" ADD CONSTRAINT "DocumentoComercial_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."DocumentoComercial" ADD CONSTRAINT "DocumentoComercial_documentoOrigenId_fkey" FOREIGN KEY ("documentoOrigenId") REFERENCES "erp"."DocumentoComercial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."DocumentoComercial" ADD CONSTRAINT "DocumentoComercial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."CuentaCorrienteMovimiento" ADD CONSTRAINT "CuentaCorrienteMovimiento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."GuiaDespacho" ADD CONSTRAINT "GuiaDespacho_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."WorkflowConfig" ADD CONSTRAINT "WorkflowConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."DelegacionAprobacion" ADD CONSTRAINT "DelegacionAprobacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."DelegacionAprobacion" ADD CONSTRAINT "DelegacionAprobacion_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."DelegacionAprobacion" ADD CONSTRAINT "DelegacionAprobacion_suplenteId_fkey" FOREIGN KEY ("suplenteId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."GrupoAprobacion" ADD CONSTRAINT "GrupoAprobacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."GrupoAprobacion" ADD CONSTRAINT "GrupoAprobacion_aprobadorInicialId_fkey" FOREIGN KEY ("aprobadorInicialId") REFERENCES "erp"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."UsuarioGrupoAprobacion" ADD CONSTRAINT "UsuarioGrupoAprobacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."UsuarioGrupoAprobacion" ADD CONSTRAINT "UsuarioGrupoAprobacion_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "erp"."GrupoAprobacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."NodoEscalaAprobacion" ADD CONSTRAINT "NodoEscalaAprobacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."NodoEscalaAprobacion" ADD CONSTRAINT "NodoEscalaAprobacion_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "erp"."GrupoAprobacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."NodoEscalaAprobacion" ADD CONSTRAINT "NodoEscalaAprobacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."NodoEscalaAprobacion" ADD CONSTRAINT "NodoEscalaAprobacion_escalaAUsuarioId_fkey" FOREIGN KEY ("escalaAUsuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."NodoEscalaAprobacion" ADD CONSTRAINT "NodoEscalaAprobacion_escalaAId_fkey" FOREIGN KEY ("escalaAId") REFERENCES "erp"."NodoEscalaAprobacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."NodoAprobador" ADD CONSTRAINT "NodoAprobador_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "erp"."NodoEscalaAprobacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."NodoAprobador" ADD CONSTRAINT "NodoAprobador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AdminConcepto" ADD CONSTRAINT "AdminConcepto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."AdminConcepto" ADD CONSTRAINT "AdminConcepto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."Notificacion" ADD CONSTRAINT "Notificacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
