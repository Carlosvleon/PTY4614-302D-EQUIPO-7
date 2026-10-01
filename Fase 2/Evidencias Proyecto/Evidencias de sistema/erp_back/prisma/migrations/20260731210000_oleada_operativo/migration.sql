-- Factor honorario: vigencia hasta
ALTER TABLE erp."FactorHonorario" ADD COLUMN IF NOT EXISTS "vigenciaHasta" TIMESTAMP(3);

-- Aging: bitácora de ediciones de vencimiento
ALTER TABLE erp."DocumentoAging" ADD COLUMN IF NOT EXISTS "vencimientoHistorial" JSONB;

-- Roles temporales por usuario
ALTER TABLE erp."Usuario" ADD COLUMN IF NOT EXISTS "rolVigenciaDesde" TIMESTAMP(3);
ALTER TABLE erp."Usuario" ADD COLUMN IF NOT EXISTS "rolVigenciaHasta" TIMESTAMP(3);
