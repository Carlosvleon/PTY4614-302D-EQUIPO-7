-- OV confirmada (stock) ≠ OC APROBADO (PIN). IF NOT EXISTS: Prisma local a menudo tiene historial vacío.
ALTER TYPE "erp"."EstadoDocumentoErp" ADD VALUE IF NOT EXISTS 'CONFIRMADA';
