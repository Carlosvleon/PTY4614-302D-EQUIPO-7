-- Dimensiones en el mapeo de cuentas por tipo de documento.
--
-- Motivo: en el plan de cuentas real (importado de Agrosoft) casi toda cuenta
-- de costo o de ingreso exige centro de costo, y varias exigen además área y
-- elemento. Los asientos automáticos (venta, compra, traspaso de contratistas,
-- cartola) no tienen de dónde deducir esas dimensiones, así que las claves
-- CONTRATISTAS, VENTAS y COMPRAS no podían apuntar a su cuenta correcta.
--
-- `centroCostoId` ya existía pero ninguna consulta del backend lo leía; el
-- front sí lo usaba para precargar el formulario de contabilización.
--
-- Requisito de MJ (Reu3): «cada cuenta contable parametriza si exige centro de
-- costo».
ALTER TABLE erp."ConfigContableSii"
  ADD COLUMN IF NOT EXISTS "areaNegocioId" TEXT,
  ADD COLUMN IF NOT EXISTS "elementoCostoId" TEXT;
