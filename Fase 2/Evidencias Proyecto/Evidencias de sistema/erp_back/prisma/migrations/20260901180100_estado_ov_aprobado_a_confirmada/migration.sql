-- Datos: las OV que usaban APROBADO (stock) pasan a CONFIRMADA. Las OC no se tocan.
UPDATE "erp"."DocumentoComercial"
SET "estado" = 'CONFIRMADA'
WHERE "tipo" = 'ORDEN_VENTA'
  AND "estado" = 'APROBADO';
