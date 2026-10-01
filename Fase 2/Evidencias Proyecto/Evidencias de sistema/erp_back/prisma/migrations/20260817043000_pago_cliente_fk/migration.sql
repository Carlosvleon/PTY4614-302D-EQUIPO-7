-- AlterTable
ALTER TABLE "erp"."Pago" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;

UPDATE "erp"."Pago" SET "proveedorId" = NULL
WHERE "proveedorId" IS NOT NULL
  AND (
    btrim("proveedorId") = ''
    OR NOT EXISTS (SELECT 1 FROM "erp"."Proveedor" p WHERE p."id" = "erp"."Pago"."proveedorId")
  );

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pago_clienteId_idx" ON "erp"."Pago"("clienteId");

-- AddForeignKey
ALTER TABLE "erp"."Pago" DROP CONSTRAINT IF EXISTS "Pago_clienteId_fkey";
ALTER TABLE "erp"."Pago" ADD CONSTRAINT "Pago_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."Pago" DROP CONSTRAINT IF EXISTS "Pago_proveedorId_fkey";
ALTER TABLE "erp"."Pago" ADD CONSTRAINT "Pago_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
