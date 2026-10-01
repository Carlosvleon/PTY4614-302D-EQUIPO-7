-- Detalle de costos / ítems en documentos comerciales (cotización, NP, factura, etc.)
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "lineas" JSONB;
