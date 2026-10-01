-- Chat Pablo 01/09 (DD-MM-YYYY → ISO). Ambas sociedades QA: N° 0.
UPDATE "erp"."Empresa"
SET "gosocketNroResolucion" = '0',
    "gosocketFechaResolucion" = '2024-10-11'
WHERE id = 'EMP-EXPORT' OR "rut" IN ('77.032.638-9', '77032638-9');

UPDATE "erp"."Empresa"
SET "gosocketNroResolucion" = '0',
    "gosocketFechaResolucion" = '2020-02-14'
WHERE id = 'EMP-SERVICES' OR "rut" IN ('77.032.639-7', '77032639-7');
