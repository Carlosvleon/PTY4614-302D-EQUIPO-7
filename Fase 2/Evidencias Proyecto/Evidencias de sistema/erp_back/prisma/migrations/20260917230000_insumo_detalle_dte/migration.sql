-- Detalle opcional del producto para DTE (SII DscItem).
-- Si está vacío el GUF no envía DscItem/DscComercial (no duplicar NmbItem).
ALTER TABLE erp."Insumo"
  ADD COLUMN IF NOT EXISTS "detalle" VARCHAR(1000);
