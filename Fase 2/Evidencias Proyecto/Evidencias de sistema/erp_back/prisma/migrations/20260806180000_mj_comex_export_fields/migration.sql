-- Pendientes MJ (manual COMEX + cliente exportación)
ALTER TABLE "erp"."Cliente" ADD COLUMN IF NOT EXISTS "tipoCliente" TEXT;
ALTER TABLE "erp"."Cliente" ADD COLUMN IF NOT EXISTS "giro" TEXT;

ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "monedaCodigo" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(18,6);
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "paisDestino" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "puertoEmbarque" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "puertoDesembarque" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "clausulaVenta" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "viaTransporte" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "modalidadVenta" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "indTraslado" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "bultoTipoCodigo" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "bultoCantidad" INTEGER;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "bultoMarca" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "montoOtraMoneda" DECIMAL(18,2);
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "montoExentoOtraMoneda" DECIMAL(18,2);
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "referenciaFecha" TIMESTAMP(3);
