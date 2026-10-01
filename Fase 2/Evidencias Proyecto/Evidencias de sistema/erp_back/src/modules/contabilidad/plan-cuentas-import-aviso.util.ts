export function avisoMaestrosFaltantes(counts: {
  centrosCount: number;
  elementosCount: number;
  areasCount: number;
}): string | null {
  const faltan: string[] = [];
  if (counts.centrosCount === 0) {
    faltan.push('centros de costo (Parametrización › Centros de costo)');
  }
  if (counts.elementosCount === 0) {
    faltan.push('elementos de costo (Parametrización › Elementos de costo)');
  }
  if (counts.areasCount === 0) {
    faltan.push('áreas de negocio (Parametrización › Áreas de negocio)');
  }
  if (!faltan.length) return null;
  if (faltan.length === 1) {
    return `No se ha configurado un maestro de ${faltan[0]}. Se recomienda configurarlo primero antes de importar el plan. ¿Desea continuar?`;
  }
  return `No se han configurado maestros de: ${faltan.join('; ')}. Se recomienda configurarlos primero antes de importar el plan. ¿Desea continuar?`;
}
