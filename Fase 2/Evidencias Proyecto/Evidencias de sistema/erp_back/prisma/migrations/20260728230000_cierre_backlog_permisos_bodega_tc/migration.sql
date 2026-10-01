-- Persistencia matriz permisos por pantalla (Reu 3)
ALTER TABLE "erp"."Rol" ADD COLUMN IF NOT EXISTS "permisosPantalla" JSONB;

-- Traspaso centralizado: TC del periodo
ALTER TABLE "erp"."PeriodoCierreContratista" ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(18,6);
ALTER TABLE "erp"."PeriodoCierreContratista" ADD COLUMN IF NOT EXISTS "monedaTc" TEXT DEFAULT 'USD';

-- Maestro artículos: cuenta de centralización
ALTER TABLE "erp"."Insumo" ADD COLUMN IF NOT EXISTS "cuentaContableId" TEXT;

-- Movimientos bodega: estados + tipos salida/devolución + par
DO $$ BEGIN
  CREATE TYPE "erp"."EstadoMovimientoBodega" AS ENUM ('BORRADOR', 'CONFIRMADO', 'ANULADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ADD VALUE no puede ir en la misma transacción que su primer uso en algunos PG;
-- se ejecuta en DO con commit implícito vía excepciones.
DO $$ BEGIN
  ALTER TYPE "erp"."TipoMovimientoBodega" ADD VALUE IF NOT EXISTS 'SALIDA_PROVEEDOR';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "erp"."TipoMovimientoBodega" ADD VALUE IF NOT EXISTS 'DEVOLUCION';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "erp"."MovimientoBodega" ADD COLUMN IF NOT EXISTS "estado" "erp"."EstadoMovimientoBodega" NOT NULL DEFAULT 'CONFIRMADO';
ALTER TABLE "erp"."MovimientoBodega" ADD COLUMN IF NOT EXISTS "bodegaDestino" TEXT;
ALTER TABLE "erp"."MovimientoBodega" ADD COLUMN IF NOT EXISTS "parId" TEXT;
