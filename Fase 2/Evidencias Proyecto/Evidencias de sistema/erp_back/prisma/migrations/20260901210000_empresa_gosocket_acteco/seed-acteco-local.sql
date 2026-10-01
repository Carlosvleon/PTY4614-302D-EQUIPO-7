-- Acteco de Export según registro público (corretaje mayor productos agrícolas).
-- Confirmar en SII / Admin si el código inscrito es otro.
UPDATE "erp"."Empresa"
SET "gosocketActeco" = '461001'
WHERE id = 'EMP-EXPORT' AND ("gosocketActeco" IS NULL OR "gosocketActeco" = '');
