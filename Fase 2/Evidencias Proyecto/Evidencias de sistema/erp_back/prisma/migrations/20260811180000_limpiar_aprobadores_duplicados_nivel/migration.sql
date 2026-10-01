-- Limpia co-aprobadores que también son principal de otro nivel del mismo grupo.
-- Idempotente.

DELETE FROM erp."NodoAprobador" na
USING erp."NodoEscalaAprobacion" n,
      erp."NodoEscalaAprobacion" other
WHERE na."nodoId" = n.id
  AND other."empresaId" = n."empresaId"
  AND other."modulo" = n."modulo"
  AND other."grupoId" = n."grupoId"
  AND other.id <> n.id
  AND other."usuarioId" = na."usuarioId"
  AND na."usuarioId" <> n."usuarioId";

DELETE FROM erp."NodoAprobador" na
USING erp."NodoEscalaAprobacion" n,
      erp."NodoAprobador" na2,
      erp."NodoEscalaAprobacion" n2
WHERE na."nodoId" = n.id
  AND na2."nodoId" = n2.id
  AND n."empresaId" = n2."empresaId"
  AND n."modulo" = n2."modulo"
  AND n."grupoId" = n2."grupoId"
  AND n.id <> n2.id
  AND na."usuarioId" = na2."usuarioId"
  AND na."usuarioId" <> n."usuarioId"
  AND na2."usuarioId" <> n2."usuarioId"
  AND n.id > n2.id;

UPDATE erp."NodoEscalaAprobacion" n
SET logica = 'SIMPLE'
WHERE n.logica IN ('AND', 'OR')
  AND (
    SELECT COUNT(*)::int
    FROM erp."NodoAprobador" a
    WHERE a."nodoId" = n.id
  ) < 2;
