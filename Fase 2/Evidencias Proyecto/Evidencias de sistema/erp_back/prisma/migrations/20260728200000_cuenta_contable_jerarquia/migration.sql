-- Plan de cuentas jerárquico: padre, nivel, código Excel origen

ALTER TABLE "erp"."CuentaContable" ADD COLUMN "codigoExcel" TEXT;
ALTER TABLE "erp"."CuentaContable" ADD COLUMN "nivel" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "erp"."CuentaContable" ADD COLUMN "padreId" TEXT;

CREATE INDEX "CuentaContable_empresaId_padreId_idx" ON "erp"."CuentaContable"("empresaId", "padreId");
CREATE INDEX "CuentaContable_empresaId_codigoExcel_idx" ON "erp"."CuentaContable"("empresaId", "codigoExcel");

ALTER TABLE "erp"."CuentaContable"
  ADD CONSTRAINT "CuentaContable_padreId_fkey"
  FOREIGN KEY ("padreId") REFERENCES "erp"."CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
