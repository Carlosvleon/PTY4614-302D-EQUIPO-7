/**
 * Dimensiones que un asiento automático toma del mapeo de cuentas por tipo de
 * documento (Config SII).
 *
 * En el plan de cuentas real casi toda cuenta de costo o de ingreso exige
 * centro de costo, y varias exigen además área y elemento. Los generadores
 * (venta, compra, traspaso de contratistas, cartola) no tienen de dónde
 * deducirlas, así que las declara el mapeo y de ahí se copian.
 */
export type DimensionesAsiento = {
  centroCostoId?: string;
  areaNegocioId?: string;
  elementoCostoId?: string;
};

type ConfigSiiDimensiones = {
  centroCostoId?: string | null;
  areaNegocioId?: string | null;
  elementoCostoId?: string | null;
} | null | undefined;

/**
 * Solo incluye las claves con valor: `assertAsientoValido` distingue ausente de
 * vacío, y una cadena vacía haría fallar la validación de la cuenta.
 */
export function dimensionesDeConfigSii(cfg: ConfigSiiDimensiones): DimensionesAsiento {
  const dim: DimensionesAsiento = {};
  const cc = cfg?.centroCostoId?.trim();
  const area = cfg?.areaNegocioId?.trim();
  const elem = cfg?.elementoCostoId?.trim();
  if (cc) dim.centroCostoId = cc;
  if (area) dim.areaNegocioId = area;
  if (elem) dim.elementoCostoId = elem;
  return dim;
}

/** Lo del documento manda; el mapeo solo cubre lo que el documento no trae. */
export function combinarDimensiones(
  preferida: DimensionesAsiento,
  respaldo: DimensionesAsiento,
): DimensionesAsiento {
  return dimensionesDeConfigSii({
    centroCostoId: preferida.centroCostoId ?? respaldo.centroCostoId ?? null,
    areaNegocioId: preferida.areaNegocioId ?? respaldo.areaNegocioId ?? null,
    elementoCostoId: preferida.elementoCostoId ?? respaldo.elementoCostoId ?? null,
  });
}
