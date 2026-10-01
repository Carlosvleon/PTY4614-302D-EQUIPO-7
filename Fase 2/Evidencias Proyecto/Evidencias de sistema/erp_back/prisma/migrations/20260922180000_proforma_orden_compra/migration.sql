-- Proforma definitiva → Orden de compra (flujo Compras estándar)
ALTER TABLE "erp"."ProformaContratista" ADD COLUMN "ordenCompraId" TEXT;

CREATE INDEX "ProformaContratista_ordenCompraId_idx" ON "erp"."ProformaContratista"("ordenCompraId");

ALTER TABLE "erp"."ProformaContratista" ADD CONSTRAINT "ProformaContratista_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "erp"."OrdenCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
