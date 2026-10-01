-- NodoAprobador + AdminConcepto + AND/OR + PasoAprobacionDetalle
-- Idempotente para hosts que ya aplicaron prisma/sql/20260811_*.sql a mano.

ALTER TABLE erp."NodoEscalaAprobacion"
  ADD COLUMN IF NOT EXISTS "logica" TEXT NOT NULL DEFAULT 'SIMPLE';

ALTER TABLE erp."NodoEscalaAprobacion"
  ADD COLUMN IF NOT EXISTS "escalaAId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NodoEscalaAprobacion_escalaAId_fkey'
  ) THEN
    ALTER TABLE erp."NodoEscalaAprobacion"
      ADD CONSTRAINT "NodoEscalaAprobacion_escalaAId_fkey"
      FOREIGN KEY ("escalaAId") REFERENCES erp."NodoEscalaAprobacion"(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

UPDATE erp."NodoEscalaAprobacion" n
SET "escalaAId" = sig.id
FROM erp."NodoEscalaAprobacion" sig
WHERE n."escalaAUsuarioId" = sig."usuarioId"
  AND n."grupoId" = sig."grupoId"
  AND n."empresaId" = sig."empresaId"
  AND n."activo" = true
  AND sig."activo" = true
  AND n."escalaAId" IS NULL;

CREATE TABLE IF NOT EXISTS erp."NodoAprobador" (
  "id"        TEXT        NOT NULL,
  "nodoId"    TEXT        NOT NULL,
  "usuarioId" TEXT        NOT NULL,
  "orden"     INTEGER     NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NodoAprobador_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "NodoAprobador_nodoId_fkey"       FOREIGN KEY ("nodoId")    REFERENCES erp."NodoEscalaAprobacion"(id) ON DELETE CASCADE,
  CONSTRAINT "NodoAprobador_usuarioId_fkey"    FOREIGN KEY ("usuarioId") REFERENCES erp."Usuario"(id),
  CONSTRAINT "NodoAprobador_nodoId_usuarioId_key" UNIQUE ("nodoId", "usuarioId")
);

CREATE INDEX IF NOT EXISTS "NodoAprobador_nodoId_idx" ON erp."NodoAprobador"("nodoId");

INSERT INTO erp."NodoAprobador" ("id", "nodoId", "usuarioId", "orden")
SELECT
  'napr_' || substring("id", 2) AS "id",
  "id"         AS "nodoId",
  "usuarioId",
  0
FROM erp."NodoEscalaAprobacion"
WHERE "usuarioId" IS NOT NULL
ON CONFLICT ("nodoId", "usuarioId") DO NOTHING;

CREATE TABLE IF NOT EXISTS erp."AdminConcepto" (
  "id"        TEXT        NOT NULL,
  "empresaId" TEXT        NOT NULL,
  "usuarioId" TEXT        NOT NULL,
  "modulo"    TEXT        NOT NULL,
  "activo"    BOOLEAN     NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminConcepto_pkey"                        PRIMARY KEY ("id"),
  CONSTRAINT "AdminConcepto_empresaId_fkey"              FOREIGN KEY ("empresaId") REFERENCES erp."Empresa"(id) ON DELETE CASCADE,
  CONSTRAINT "AdminConcepto_usuarioId_fkey"              FOREIGN KEY ("usuarioId") REFERENCES erp."Usuario"(id) ON DELETE CASCADE,
  CONSTRAINT "AdminConcepto_empresaId_usuarioId_modulo_key" UNIQUE ("empresaId", "usuarioId", "modulo")
);

CREATE INDEX IF NOT EXISTS "AdminConcepto_empresaId_modulo_idx" ON erp."AdminConcepto"("empresaId", "modulo");

CREATE TABLE IF NOT EXISTS erp."PasoAprobacionDetalle" (
  "id"           TEXT NOT NULL,
  "documentoId"  TEXT NOT NULL,
  "tipoDoc"      TEXT NOT NULL,
  "nodoId"       TEXT NOT NULL,
  "usuarioId"    TEXT NOT NULL,
  "estado"       TEXT NOT NULL DEFAULT 'PENDIENTE',
  "comentario"   TEXT,
  "respondidoAt" TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasoAprobacionDetalle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasoAprobacionDetalle_documentoId_tipoDoc_nodoId_usuarioId_key"
    UNIQUE ("documentoId", "tipoDoc", "nodoId", "usuarioId")
);

CREATE INDEX IF NOT EXISTS "PasoAprobacionDetalle_documentoId_tipoDoc_nodoId_idx"
  ON erp."PasoAprobacionDetalle"("documentoId", "tipoDoc", "nodoId");
