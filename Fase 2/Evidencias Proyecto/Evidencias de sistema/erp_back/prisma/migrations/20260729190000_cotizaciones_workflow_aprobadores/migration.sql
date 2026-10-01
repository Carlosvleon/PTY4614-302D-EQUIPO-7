-- OC: jefe aprobador
ALTER TABLE "erp"."OrdenCompra" ADD COLUMN IF NOT EXISTS "aprobadorId" TEXT;
ALTER TABLE "erp"."OrdenCompra" ADD COLUMN IF NOT EXISTS "aprobadorNombre" TEXT;
CREATE INDEX IF NOT EXISTS "OrdenCompra_aprobadorId_idx" ON "erp"."OrdenCompra"("aprobadorId");

-- AprobacionOc: asignación + resolución
ALTER TABLE "erp"."AprobacionOc" ADD COLUMN IF NOT EXISTS "aprobadorId" TEXT;
ALTER TABLE "erp"."AprobacionOc" ADD COLUMN IF NOT EXISTS "aprobadorNombre" TEXT;
ALTER TABLE "erp"."AprobacionOc" ADD COLUMN IF NOT EXISTS "resueltoPorId" TEXT;
ALTER TABLE "erp"."AprobacionOc" ADD COLUMN IF NOT EXISTS "resueltoPorNombre" TEXT;
CREATE INDEX IF NOT EXISTS "AprobacionOc_aprobadorId_idx" ON "erp"."AprobacionOc"("aprobadorId");

-- Workflow: usuarios aprobadores
ALTER TABLE "erp"."WorkflowConfig" ADD COLUMN IF NOT EXISTS "aprobadorIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS "WorkflowConfig_modulo_idx" ON "erp"."WorkflowConfig"("modulo");
