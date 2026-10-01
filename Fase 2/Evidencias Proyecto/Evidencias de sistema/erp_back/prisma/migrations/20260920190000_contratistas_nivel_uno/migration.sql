-- Contratistas Nivel 1: maestros contables, trazabilidad, tarifa aplicada,
-- cierre auditable y enlace a la factura recibida única en Compras.

ALTER TABLE "erp"."Contratista"
  ADD COLUMN IF NOT EXISTS "direccion" TEXT,
  ADD COLUMN IF NOT EXISTS "ciudad" TEXT,
  ADD COLUMN IF NOT EXISTS "comuna" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "telefono1" TEXT,
  ADD COLUMN IF NOT EXISTS "telefono2" TEXT,
  ADD COLUMN IF NOT EXISTS "representanteLegal" TEXT,
  ADD COLUMN IF NOT EXISTS "rutRepresentante" TEXT,
  ADD COLUMN IF NOT EXISTS "tipoPago" TEXT,
  ADD COLUMN IF NOT EXISTS "observaciones" JSONB,
  ADD COLUMN IF NOT EXISTS "proveedorId" TEXT;

CREATE INDEX IF NOT EXISTS "Contratista_proveedorId_idx"
  ON "erp"."Contratista"("proveedorId");

ALTER TABLE "erp"."Contratista"
  ADD CONSTRAINT "Contratista_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "erp"."TipoContratoContratista" (
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
  CONSTRAINT "TipoContratoContratista_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TipoContratoContratista_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TipoContratoContratista_cuentaDebeId_fkey"
    FOREIGN KEY ("cuentaDebeId") REFERENCES "erp"."CuentaContable"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TipoContratoContratista_cuentaHaberId_fkey"
    FOREIGN KEY ("cuentaHaberId") REFERENCES "erp"."CuentaContable"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TipoContratoContratista_cuentaAdministracionId_fkey"
    FOREIGN KEY ("cuentaAdministracionId") REFERENCES "erp"."CuentaContable"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TipoContratoContratista_empresaId_codigo_key"
  ON "erp"."TipoContratoContratista"("empresaId", "codigo");
CREATE INDEX IF NOT EXISTS "TipoContratoContratista_empresaId_idx"
  ON "erp"."TipoContratoContratista"("empresaId");

ALTER TABLE "erp"."TarifaContratista"
  ADD COLUMN IF NOT EXISTS "tipoContratoId" TEXT;
CREATE INDEX IF NOT EXISTS "TarifaContratista_tipoContratoId_idx"
  ON "erp"."TarifaContratista"("tipoContratoId");
ALTER TABLE "erp"."TarifaContratista"
  ADD CONSTRAINT "TarifaContratista_tipoContratoId_fkey"
  FOREIGN KEY ("tipoContratoId") REFERENCES "erp"."TipoContratoContratista"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."ProformaContratista"
  ADD COLUMN IF NOT EXISTS "tipoContratoId" TEXT,
  ADD COLUMN IF NOT EXISTS "registroCompraId" TEXT;
CREATE INDEX IF NOT EXISTS "ProformaContratista_tipoContratoId_idx"
  ON "erp"."ProformaContratista"("tipoContratoId");
CREATE INDEX IF NOT EXISTS "ProformaContratista_registroCompraId_idx"
  ON "erp"."ProformaContratista"("registroCompraId");
ALTER TABLE "erp"."ProformaContratista"
  ADD CONSTRAINT "ProformaContratista_tipoContratoId_fkey"
  FOREIGN KEY ("tipoContratoId") REFERENCES "erp"."TipoContratoContratista"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProformaContratista_registroCompraId_fkey"
  FOREIGN KEY ("registroCompraId") REFERENCES "erp"."RegistroCompra"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."IngresoLaborDiario"
  ADD COLUMN IF NOT EXISTS "tipoContratoId" TEXT,
  ADD COLUMN IF NOT EXISTS "tarifaId" TEXT,
  ADD COLUMN IF NOT EXISTS "tarifaAplicada" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unidad" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "precioOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "motivoOverride" TEXT;

UPDATE "erp"."IngresoLaborDiario"
SET "tarifaAplicada" = "precioUnitario"
WHERE "tarifaAplicada" = 0;

CREATE INDEX IF NOT EXISTS "IngresoLaborDiario_tipoContratoId_idx"
  ON "erp"."IngresoLaborDiario"("tipoContratoId");
CREATE INDEX IF NOT EXISTS "IngresoLaborDiario_tarifaId_idx"
  ON "erp"."IngresoLaborDiario"("tarifaId");
ALTER TABLE "erp"."IngresoLaborDiario"
  ADD CONSTRAINT "IngresoLaborDiario_tipoContratoId_fkey"
  FOREIGN KEY ("tipoContratoId") REFERENCES "erp"."TipoContratoContratista"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "IngresoLaborDiario_tarifaId_fkey"
  FOREIGN KEY ("tarifaId") REFERENCES "erp"."TarifaContratista"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."PeriodoCierreContratista"
  ADD COLUMN IF NOT EXISTS "cerradoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cerradoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "cerradoPorNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "tiposCambio" JSONB;

CREATE TABLE IF NOT EXISTS "erp"."PeriodoCierreContratistaEvento" (
  "id" TEXT NOT NULL,
  "cierreId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "accion" TEXT NOT NULL,
  "motivo" TEXT,
  "usuarioId" TEXT NOT NULL,
  "usuarioNombre" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PeriodoCierreContratistaEvento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PeriodoCierreContratistaEvento_cierreId_fkey"
    FOREIGN KEY ("cierreId") REFERENCES "erp"."PeriodoCierreContratista"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PeriodoCierreContratistaEvento_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PeriodoCierreContratistaEvento_cierreId_createdAt_idx"
  ON "erp"."PeriodoCierreContratistaEvento"("cierreId", "createdAt");
CREATE INDEX IF NOT EXISTS "PeriodoCierreContratistaEvento_empresaId_createdAt_idx"
  ON "erp"."PeriodoCierreContratistaEvento"("empresaId", "createdAt");

CREATE TABLE IF NOT EXISTS "erp"."AuditoriaContratista" (
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
  CONSTRAINT "AuditoriaContratista_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditoriaContratista_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AuditoriaContratista_empresaId_createdAt_idx"
  ON "erp"."AuditoriaContratista"("empresaId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditoriaContratista_entidad_entidadId_idx"
  ON "erp"."AuditoriaContratista"("entidad", "entidadId");

ALTER TABLE "erp"."RegistroCompra"
  ADD COLUMN IF NOT EXISTS "fechaDocumento" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moneda" TEXT NOT NULL DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS "origen" TEXT NOT NULL DEFAULT 'COMPRAS';

-- Permisos por acción: la separación efectiva se aplica en los endpoints.
UPDATE "erp"."Rol"
SET "permisos" = ARRAY['contratistas:read', 'contratistas:capture']::TEXT[]
WHERE "id" = 'ROL-3';

UPDATE "erp"."Rol"
SET "codigo" = 'JEFATURA_CONTRATISTAS',
    "nombre" = 'Jefatura contratistas',
    "permisos" = ARRAY[
      'contratistas:read',
      'contratistas:capture',
      'contratistas:catalogs',
      'contratistas:rates',
      'contratistas:rate-override',
      'contratistas:finalize',
      'contratistas:invoice',
      'contratistas:reverse',
      'contratistas:audit'
    ]::TEXT[]
WHERE "id" = 'ROL-5';
