-- AlterEnum
ALTER TYPE "erp"."TipoMovimientoBodega" ADD VALUE 'SALIDA_VENTA';
ALTER TYPE "erp"."TipoMovimientoBodega" ADD VALUE 'ENTRADA_VENTA_ANULACION';
ALTER TYPE "erp"."TipoDocumentoComercial" ADD VALUE 'ORDEN_VENTA';

ALTER TABLE "erp"."Empresa" ADD COLUMN "ventaBajoCosto" TEXT NOT NULL DEFAULT 'BLOQUEAR';

ALTER TABLE "erp"."Proveedor" ADD COLUMN "solicitadoPor" TEXT;
ALTER TABLE "erp"."Proveedor" ADD COLUMN "solicitadoNota" TEXT;

ALTER TABLE "erp"."Cliente" ADD COLUMN "solicitadoPor" TEXT;
ALTER TABLE "erp"."Cliente" ADD COLUMN "solicitadoNota" TEXT;

ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN "proveedorId" TEXT;

CREATE TABLE "erp"."StockInsumoBodega" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "bodegaId" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockInsumoBodega_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockInsumoBodega_empresaId_insumoId_bodegaId_key" ON "erp"."StockInsumoBodega"("empresaId", "insumoId", "bodegaId");
CREATE INDEX "StockInsumoBodega_empresaId_insumoId_idx" ON "erp"."StockInsumoBodega"("empresaId", "insumoId");

ALTER TABLE "erp"."StockInsumoBodega" ADD CONSTRAINT "StockInsumoBodega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."StockInsumoBodega" ADD CONSTRAINT "StockInsumoBodega_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "erp"."Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."StockInsumoBodega" ADD CONSTRAINT "StockInsumoBodega_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "erp"."Bodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "erp"."StockInsumoBodega" ("id", "empresaId", "insumoId", "bodegaId", "cantidad", "updatedAt")
SELECT concat('sib_', i."id"), i."empresaId", i."id", b."id", i."stock", NOW()
FROM "erp"."Insumo" i
INNER JOIN LATERAL (
  SELECT b0."id"
  FROM "erp"."Bodega" b0
  WHERE b0."empresaId" = i."empresaId" AND b0."activa" = true
  ORDER BY b0."codigo"
  LIMIT 1
) b ON true
WHERE i."stock" > 0
ON CONFLICT ("empresaId", "insumoId", "bodegaId") DO NOTHING;
