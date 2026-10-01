-- PIN de aprobación por rol (Sergio): flag en Rol + hash en Usuario.
ALTER TABLE erp."Rol"
  ADD COLUMN IF NOT EXISTS "aprobarConPin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE erp."Usuario"
  ADD COLUMN IF NOT EXISTS "pinAprobacionHash" TEXT;

-- Roles operativos de aprobación: PIN habilitado por defecto.
UPDATE erp."Rol"
SET "aprobarConPin" = true
WHERE id IN ('ROL-5', 'ROL-7', 'ROL-9')
   OR codigo ILIKE '%aprob%'
   OR nombre ILIKE '%aprob%';
