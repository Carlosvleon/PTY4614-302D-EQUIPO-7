-- Moneda nativa de la cartola (por hoja: CLP / USD / CNY).
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.

ALTER TABLE "erp"."CartolaBancaria"
  ADD COLUMN IF NOT EXISTS "moneda" TEXT NOT NULL DEFAULT 'CLP';

UPDATE "erp"."CartolaBancaria" c
SET "moneda" = 'CNY'
WHERE EXISTS (
  SELECT 1 FROM "erp"."MovimientoCartola" m
  WHERE m."cartolaId" = c.id AND m.glosa ILIKE '%YUAN%'
);

UPDATE "erp"."CartolaBancaria" c
SET "moneda" = 'USD'
WHERE c."moneda" = 'CLP'
  AND EXISTS (
    SELECT 1 FROM "erp"."MovimientoCartola" m
    WHERE m."cartolaId" = c.id AND (m.glosa ILIKE '%USD%' OR m.glosa ILIKE '%DÓLAR%' OR m.glosa ILIKE '%DOLAR%')
  );
