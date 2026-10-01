-- Maestro proveedores + FK en OC/registro; NC↔factura; marca centralización bodega

CREATE TABLE "erp"."Proveedor" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "giro" TEXT,
    "contacto" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Proveedor_empresaId_rut_key" ON "erp"."Proveedor"("empresaId", "rut");
CREATE INDEX "Proveedor_empresaId_idx" ON "erp"."Proveedor"("empresaId");

ALTER TABLE "erp"."Proveedor" ADD CONSTRAINT "Proveedor_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."OrdenCompra" ADD COLUMN "proveedorId" TEXT;
CREATE INDEX "OrdenCompra_proveedorId_idx" ON "erp"."OrdenCompra"("proveedorId");
ALTER TABLE "erp"."OrdenCompra" ADD CONSTRAINT "OrdenCompra_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."RegistroCompra" ADD COLUMN "proveedorId" TEXT;
CREATE INDEX "RegistroCompra_proveedorId_idx" ON "erp"."RegistroCompra"("proveedorId");
ALTER TABLE "erp"."RegistroCompra" ADD CONSTRAINT "RegistroCompra_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."MovimientoBodega" ADD COLUMN "centralizadoAsientoId" TEXT;
ALTER TABLE "erp"."MovimientoBodega" ADD COLUMN "centralizadoAsientoNumero" TEXT;

ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN "documentoOrigenId" TEXT;
CREATE INDEX "DocumentoComercial_documentoOrigenId_idx" ON "erp"."DocumentoComercial"("documentoOrigenId");
ALTER TABLE "erp"."DocumentoComercial" ADD CONSTRAINT "DocumentoComercial_documentoOrigenId_fkey"
  FOREIGN KEY ("documentoOrigenId") REFERENCES "erp"."DocumentoComercial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
