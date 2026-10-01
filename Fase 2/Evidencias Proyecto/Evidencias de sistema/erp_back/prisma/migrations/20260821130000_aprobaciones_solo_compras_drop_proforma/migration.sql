-- Cadena de aprobación solo Compras: quitar proformas Contratistas.
-- Se conserva el módulo operativo de proformas y no se eliminan columnas/enum.

UPDATE "erp"."ProformaContratista"
SET
  "estado" = 'BORRADOR',
  "aprobadorId" = NULL,
  "aprobadorNombre" = NULL,
  "aprobacionCadenaIds" = ARRAY[]::TEXT[],
  "aprobacionPasoActual" = 0,
  "aprobacionPasosTotal" = 0,
  "aprobadoPorId" = NULL,
  "aprobadoPorNombre" = NULL,
  "aprobadaAt" = NULL
WHERE "estado" = 'PENDIENTE_APROBACION';

UPDATE "erp"."Notificacion"
SET "leida" = TRUE
WHERE "tipo" = 'PROFORMA_PENDIENTE'
  OR "refKey" LIKE 'prf-pend:%';

DELETE FROM "erp"."UsuarioGrupoAprobacion" ug
USING "erp"."GrupoAprobacion" g
WHERE ug."grupoId" = g."id"
  AND lower(g."modulo") = 'contratistas';

DELETE FROM "erp"."NodoAprobador" na
USING "erp"."NodoEscalaAprobacion" n
WHERE na."nodoId" = n."id"
  AND lower(n."modulo") = 'contratistas';

UPDATE "erp"."NodoEscalaAprobacion"
SET "escalaAId" = NULL
WHERE lower("modulo") = 'contratistas';

DELETE FROM "erp"."DelegacionAprobacion"
WHERE lower(COALESCE("modulo", '')) = 'contratistas';

DELETE FROM "erp"."NodoEscalaAprobacion"
WHERE lower("modulo") = 'contratistas';

DELETE FROM "erp"."GrupoAprobacion"
WHERE lower("modulo") = 'contratistas';

DELETE FROM "erp"."AdminConcepto"
WHERE lower("modulo") = 'contratistas';

DELETE FROM "erp"."WorkflowConfig"
WHERE lower("modulo") = 'contratistas';
