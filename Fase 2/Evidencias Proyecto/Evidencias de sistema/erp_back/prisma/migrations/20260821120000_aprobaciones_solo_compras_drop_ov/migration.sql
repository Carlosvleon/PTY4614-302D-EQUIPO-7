-- Cadena de aprobación solo Compras: quitar OV (piloto comercial).
-- No se elimina el valor de enum AUTORIZADA (PostgreSQL no permite DROP VALUE fácil).

UPDATE "erp"."DocumentoComercial"
SET "estado" = 'BORRADOR'
WHERE "tipo" = 'ORDEN_VENTA'
  AND "estado" IN ('PENDIENTE_APROBACION', 'AUTORIZADA');

DROP TABLE IF EXISTS "erp"."AprobacionOv";

DROP INDEX IF EXISTS "erp"."DocumentoComercial_aprobadorId_idx";

ALTER TABLE "erp"."DocumentoComercial"
  DROP COLUMN IF EXISTS "aprobadorId",
  DROP COLUMN IF EXISTS "aprobadorNombre",
  DROP COLUMN IF EXISTS "aprobacionCadenaIds",
  DROP COLUMN IF EXISTS "aprobacionPasoActual",
  DROP COLUMN IF EXISTS "aprobacionPasosTotal",
  DROP COLUMN IF EXISTS "aprobadoPorId",
  DROP COLUMN IF EXISTS "aprobadoPorNombre",
  DROP COLUMN IF EXISTS "aprobadaAt",
  DROP COLUMN IF EXISTS "motivoRechazoOv";

ALTER TABLE "erp"."Empresa"
  DROP COLUMN IF EXISTS "comercialRequiereAprobacion",
  DROP COLUMN IF EXISTS "comercialAprobacionDesde";

DELETE FROM "erp"."UsuarioGrupoAprobacion" ug
USING "erp"."GrupoAprobacion" g
WHERE ug."grupoId" = g."id" AND g."modulo" = 'Comercial';

DELETE FROM "erp"."NodoAprobador" na
USING "erp"."NodoEscalaAprobacion" n
WHERE na."nodoId" = n."id" AND n."modulo" = 'Comercial';

DELETE FROM "erp"."NodoEscalaAprobacion" WHERE "modulo" = 'Comercial';
DELETE FROM "erp"."GrupoAprobacion" WHERE "modulo" = 'Comercial';
DELETE FROM "erp"."AdminConcepto" WHERE "modulo" = 'Comercial';
DELETE FROM "erp"."WorkflowConfig" WHERE lower("modulo") = 'comercial';
