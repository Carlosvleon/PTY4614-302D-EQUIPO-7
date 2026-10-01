-- AlterEnum: documentos de salida del wizard Emitir (Factura/NC ya existían).
ALTER TYPE "erp"."TipoDocumentoComercial" ADD VALUE 'ND';
ALTER TYPE "erp"."TipoDocumentoComercial" ADD VALUE 'GUIA';
