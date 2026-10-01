-- Periodos contables + configuración SII→cuenta

CREATE TYPE "erp"."EstadoPeriodoContable" AS ENUM ('ABIERTO', 'CERRADO');

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

CREATE TABLE "erp"."ConfigContableSii" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipoDocumentoSii" TEXT NOT NULL,
    "codigoSii" TEXT,
    "nombre" TEXT NOT NULL,
    "cuentaContableId" TEXT NOT NULL,
    "centroCostoId" TEXT,
    "lado" TEXT NOT NULL DEFAULT 'DEBE',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigContableSii_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PeriodoContable_empresaId_codigo_key" ON "erp"."PeriodoContable"("empresaId", "codigo");
CREATE INDEX "PeriodoContable_empresaId_estado_idx" ON "erp"."PeriodoContable"("empresaId", "estado");

CREATE UNIQUE INDEX "ConfigContableSii_empresaId_tipoDocumentoSii_key" ON "erp"."ConfigContableSii"("empresaId", "tipoDocumentoSii");
CREATE INDEX "ConfigContableSii_empresaId_idx" ON "erp"."ConfigContableSii"("empresaId");

ALTER TABLE "erp"."PeriodoContable"
  ADD CONSTRAINT "PeriodoContable_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."ConfigContableSii"
  ADD CONSTRAINT "ConfigContableSii_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."ConfigContableSii"
  ADD CONSTRAINT "ConfigContableSii_cuentaContableId_fkey"
  FOREIGN KEY ("cuentaContableId") REFERENCES "erp"."CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
