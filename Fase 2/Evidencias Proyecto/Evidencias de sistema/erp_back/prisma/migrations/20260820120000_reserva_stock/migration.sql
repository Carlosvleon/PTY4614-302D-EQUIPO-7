-- CreateEnum
CREATE TYPE "erp"."EstadoReservaStock" AS ENUM ('ACTIVA', 'CONSUMIDA', 'LIBERADA', 'VENCIDA');

-- CreateTable
CREATE TABLE "erp"."ReservaStock" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "bodegaId" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "estado" "erp"."EstadoReservaStock" NOT NULL DEFAULT 'ACTIVA',
    "venceAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservaStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservaStock_empresaId_insumoId_bodegaId_estado_idx" ON "erp"."ReservaStock"("empresaId", "insumoId", "bodegaId", "estado");

-- CreateIndex
CREATE INDEX "ReservaStock_empresaId_documentoId_idx" ON "erp"."ReservaStock"("empresaId", "documentoId");

-- CreateIndex
CREATE INDEX "ReservaStock_venceAt_idx" ON "erp"."ReservaStock"("venceAt");

-- AddForeignKey
ALTER TABLE "erp"."ReservaStock" ADD CONSTRAINT "ReservaStock_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ReservaStock" ADD CONSTRAINT "ReservaStock_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "erp"."DocumentoComercial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ReservaStock" ADD CONSTRAINT "ReservaStock_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "erp"."Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."ReservaStock" ADD CONSTRAINT "ReservaStock_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "erp"."Bodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;
