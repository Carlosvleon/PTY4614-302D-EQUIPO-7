-- Reu 3: multi-empresa usuarios, OC cabecera contable, proforma aprobación supervisor

CREATE TABLE "erp"."UsuarioEmpresa" (
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioEmpresa_pkey" PRIMARY KEY ("usuarioId","empresaId")
);

CREATE INDEX "UsuarioEmpresa_empresaId_idx" ON "erp"."UsuarioEmpresa"("empresaId");

ALTER TABLE "erp"."UsuarioEmpresa"
  ADD CONSTRAINT "UsuarioEmpresa_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."UsuarioEmpresa"
  ADD CONSTRAINT "UsuarioEmpresa_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "erp"."UsuarioEmpresa" ("usuarioId", "empresaId")
SELECT "id", "empresaId" FROM "erp"."Usuario"
ON CONFLICT DO NOTHING;

ALTER TABLE "erp"."OrdenCompra" ADD COLUMN "cuentaContableId" TEXT;
ALTER TABLE "erp"."OrdenCompra" ADD COLUMN "centroCostoId" TEXT;
ALTER TABLE "erp"."OrdenCompra" ADD COLUMN "elementoCostoId" TEXT;

ALTER TYPE "erp"."EstadoProforma" ADD VALUE 'PENDIENTE_APROBACION';

ALTER TABLE "erp"."ProformaContratista" ADD COLUMN "aprobadorId" TEXT;
ALTER TABLE "erp"."ProformaContratista" ADD COLUMN "aprobadorNombre" TEXT;
ALTER TABLE "erp"."ProformaContratista" ADD COLUMN "aprobadaAt" TIMESTAMP(3);
