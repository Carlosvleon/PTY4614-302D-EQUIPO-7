-- Historial de vigencia contratista, aprobación ingresos, ampliación estados

CREATE TABLE IF NOT EXISTS "erp"."ContratistaVigenciaHistorial" (
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

CREATE INDEX "ContratistaVigenciaHistorial_contratistaId_idx"
  ON "erp"."ContratistaVigenciaHistorial"("contratistaId");

ALTER TABLE "erp"."ContratistaVigenciaHistorial"
  ADD CONSTRAINT "ContratistaVigenciaHistorial_contratistaId_fkey"
  FOREIGN KEY ("contratistaId") REFERENCES "erp"."Contratista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."ContratistaVigenciaHistorial"
  ADD CONSTRAINT "ContratistaVigenciaHistorial_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ingreso: aprobación supervisor
ALTER TYPE "erp"."EstadoIngresoLabor" ADD VALUE 'PENDIENTE_APROBACION';

ALTER TABLE "erp"."IngresoLaborDiario"
  ADD COLUMN IF NOT EXISTS "aprobadorId" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobadorNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobadoPorNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobadaAt" TIMESTAMP(3);

ALTER TABLE "erp"."IngresoLaborDiario"
  ALTER COLUMN "tarifaId" DROP NOT NULL;
