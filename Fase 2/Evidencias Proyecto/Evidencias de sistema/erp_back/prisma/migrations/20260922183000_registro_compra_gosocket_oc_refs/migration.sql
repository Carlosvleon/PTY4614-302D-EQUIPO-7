-- OC referenciadas en XML GoSocket (TpoDocRef 801)
ALTER TABLE "erp"."RegistroCompra" ADD COLUMN IF NOT EXISTS "gosocketOcReferencias" JSONB;
