-- Bodega/insumo FKs en movimientos (stock solo por id, no por nombre).

ALTER TABLE "erp"."MovimientoBodega" ADD COLUMN "bodegaId" TEXT;
ALTER TABLE "erp"."MovimientoBodega" ADD COLUMN "bodegaDestinoId" TEXT;

UPDATE "erp"."MovimientoBodega" m
SET "bodegaId" = b."id"
FROM "erp"."Bodega" b
WHERE m."empresaId" = b."empresaId"
  AND m."bodegaId" IS NULL
  AND (m."bodega" = b."id" OR m."bodega" = b."codigo" OR m."bodega" = b."nombre");

UPDATE "erp"."MovimientoBodega" m
SET "bodegaDestinoId" = b."id"
FROM "erp"."Bodega" b
WHERE m."empresaId" = b."empresaId"
  AND m."bodegaDestino" IS NOT NULL
  AND m."bodegaDestinoId" IS NULL
  AND (m."bodegaDestino" = b."id" OR m."bodegaDestino" = b."codigo" OR m."bodegaDestino" = b."nombre");

UPDATE "erp"."MovimientoBodega" m
SET "insumoId" = NULL
WHERE m."insumoId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "erp"."Insumo" i WHERE i."id" = m."insumoId"
  );

CREATE INDEX "MovimientoBodega_bodegaId_idx" ON "erp"."MovimientoBodega"("bodegaId");
CREATE INDEX "MovimientoBodega_insumoId_idx" ON "erp"."MovimientoBodega"("insumoId");

ALTER TABLE "erp"."MovimientoBodega" ADD CONSTRAINT "MovimientoBodega_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "erp"."Bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."MovimientoBodega" ADD CONSTRAINT "MovimientoBodega_bodegaDestinoId_fkey" FOREIGN KEY ("bodegaDestinoId") REFERENCES "erp"."Bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."MovimientoBodega" ADD CONSTRAINT "MovimientoBodega_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "erp"."Insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
