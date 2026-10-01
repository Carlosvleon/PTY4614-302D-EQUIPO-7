-- CodRef SII en NC/ND (1 anula, 2 corrige texto, 3 corrige montos).
ALTER TABLE erp."DocumentoComercial"
  ADD COLUMN IF NOT EXISTS "referenciaCod" INTEGER;
