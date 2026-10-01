-- AlterTable
ALTER TABLE "erp"."AnticipoProductor" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;
ALTER TABLE "erp"."AnticipoProductor" ADD COLUMN IF NOT EXISTS "proveedorId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnticipoProductor_clienteId_idx" ON "erp"."AnticipoProductor"("clienteId");
CREATE INDEX IF NOT EXISTS "AnticipoProductor_proveedorId_idx" ON "erp"."AnticipoProductor"("proveedorId");

-- AddForeignKey
ALTER TABLE "erp"."AnticipoProductor" DROP CONSTRAINT IF EXISTS "AnticipoProductor_clienteId_fkey";
ALTER TABLE "erp"."AnticipoProductor" ADD CONSTRAINT "AnticipoProductor_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."AnticipoProductor" DROP CONSTRAINT IF EXISTS "AnticipoProductor_proveedorId_fkey";
ALTER TABLE "erp"."AnticipoProductor" ADD CONSTRAINT "AnticipoProductor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
