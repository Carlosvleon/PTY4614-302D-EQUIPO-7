-- D16: piso de venta = precio de compra del maestro de productos.
-- Origen: Sergio Reu6 [49:38] «eso sí lo podríamos dejar en el mantenedor de
-- productos, asociarle el precio compra»; MJ [50:00] «Si se puede, ideal».
-- 0 = no cargado; la validación cae a costoPromedio para no desactivar la regla
-- sobre los productos que ya existen.
ALTER TABLE erp."Insumo"
  ADD COLUMN IF NOT EXISTS "precioCompra" DECIMAL(18, 4) NOT NULL DEFAULT 0;
