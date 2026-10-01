-- Concepto agrupador del flujo (ítem Excel) + FK opcional en código financiero.
-- Nómina/semana en movimiento de cartola (egresos); sin asiento NOMINA.

CREATE TABLE erp."ConceptoFlujo" (
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

CREATE UNIQUE INDEX "ConceptoFlujo_empresaId_codigo_key" ON erp."ConceptoFlujo"("empresaId", "codigo");
CREATE INDEX "ConceptoFlujo_empresaId_activo_orden_idx" ON erp."ConceptoFlujo"("empresaId", "activo", "orden");

ALTER TABLE erp."ConceptoFlujo"
  ADD CONSTRAINT "ConceptoFlujo_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES erp."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE erp."CodigoFinanciero"
  ADD COLUMN IF NOT EXISTS "conceptoId" TEXT;

CREATE INDEX IF NOT EXISTS "CodigoFinanciero_conceptoId_idx" ON erp."CodigoFinanciero"("conceptoId");

ALTER TABLE erp."CodigoFinanciero"
  ADD CONSTRAINT "CodigoFinanciero_conceptoId_fkey"
  FOREIGN KEY ("conceptoId") REFERENCES erp."ConceptoFlujo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE erp."MovimientoCartola"
  ADD COLUMN IF NOT EXISTS "nominaSemana" TEXT;

CREATE INDEX IF NOT EXISTS "MovimientoCartola_empresaId_nominaSemana_idx"
  ON erp."MovimientoCartola"("empresaId", "nominaSemana");
