-- País del receptor (CodPaisRecep, T7 Aduana) y TpoMoneda explícito en COMEX.
ALTER TABLE erp."DocumentoComercial"
  ADD COLUMN IF NOT EXISTS "paisRecepCodigo" TEXT;
ALTER TABLE erp."DocumentoComercial"
  ADD COLUMN IF NOT EXISTS "tpoMoneda" TEXT;
