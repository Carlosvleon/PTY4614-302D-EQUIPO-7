-- Clave de reversa/rechazo por usuario (D3 Reu4).
ALTER TABLE "erp"."Usuario"
  ADD COLUMN IF NOT EXISTS "claveReversaHash" TEXT;
