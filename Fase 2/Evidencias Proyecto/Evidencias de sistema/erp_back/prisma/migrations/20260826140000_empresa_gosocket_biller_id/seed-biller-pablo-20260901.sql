-- BillerId Export que Pablo pegó en el chat del kickoff 01/09.
UPDATE "erp"."Empresa"
SET "gosocketBillerId" = 'd159916d-4977-499f-a52e-70550fc379ee'
WHERE id = 'EMP-EXPORT' OR "rut" IN ('77.032.638-9', '77032638-9');
