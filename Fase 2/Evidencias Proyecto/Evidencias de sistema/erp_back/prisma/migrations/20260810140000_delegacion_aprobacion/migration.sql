-- Suplencia / vacaciones en aprobaciones (Reu6 D6)

CREATE TABLE "erp"."DelegacionAprobacion" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "titularId" TEXT NOT NULL,
  "suplenteId" TEXT NOT NULL,
  "modulo" TEXT,
  "vigenciaDesde" TIMESTAMP(3) NOT NULL,
  "vigenciaHasta" TIMESTAMP(3),
  "motivo" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DelegacionAprobacion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "erp"."DelegacionAprobacion"
  ADD CONSTRAINT "DelegacionAprobacion_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."DelegacionAprobacion"
  ADD CONSTRAINT "DelegacionAprobacion_titularId_fkey"
  FOREIGN KEY ("titularId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."DelegacionAprobacion"
  ADD CONSTRAINT "DelegacionAprobacion_suplenteId_fkey"
  FOREIGN KEY ("suplenteId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DelegacionAprobacion_empresaId_titularId_idx"
  ON "erp"."DelegacionAprobacion"("empresaId", "titularId");

CREATE INDEX "DelegacionAprobacion_empresaId_vigenciaDesde_vigenciaHasta_idx"
  ON "erp"."DelegacionAprobacion"("empresaId", "vigenciaDesde", "vigenciaHasta");
