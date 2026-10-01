-- AlterTable
ALTER TABLE "erp"."Usuario" ADD COLUMN IF NOT EXISTS "microsoftOid" TEXT;
ALTER TABLE "erp"."Usuario" ADD COLUMN IF NOT EXISTS "microsoftLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_microsoftOid_key" ON "erp"."Usuario"("microsoftOid");
