import type { TarifaContratista } from '@/types/domain';

export type TarifaLookupInput = {
  contratistaId: string;
  centroCostoId: string;
  laborId: string;
  actividadId: string;
  fecha: string;
};

/** Misma regla que el back: vigencia + la más reciente por vigenciaDesde. */
export function findTarifaVigente(
  tarifas: TarifaContratista[],
  input: TarifaLookupInput,
): TarifaContratista | undefined {
  const {
    contratistaId,
    centroCostoId,
    laborId,
    actividadId,
    fecha,
  } = input;
  if (!contratistaId || !centroCostoId || !laborId || !actividadId || !fecha) {
    return undefined;
  }
  const matches = tarifas.filter(
    (row) =>
      row.contratistaId === contratistaId
      && row.centroCostoId === centroCostoId
      && row.laborId === laborId
      && row.actividadId === actividadId
      && row.vigenciaDesde <= fecha
      && (!row.vigenciaHasta || row.vigenciaHasta >= fecha),
  );
  if (!matches.length) return undefined;
  return [...matches].sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
}
