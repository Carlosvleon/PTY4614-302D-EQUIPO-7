export type CuentaPlanDim = {
  codigo?: string;
  nombre?: string;
  requiereCc?: boolean;
  requiereArea?: boolean;
  requiereElemento?: boolean;
  centroCostoIds?: string[];
  areaNegocioIds?: string[];
  elementoCostoIds?: string[];
};

export type OptionPlan = { value: string; label: string };

function etiquetaCuenta(cuenta: CuentaPlanDim): string {
  if (cuenta.codigo && cuenta.nombre) return `${cuenta.codigo} · ${cuenta.nombre}`;
  if (cuenta.codigo) return cuenta.codigo;
  return 'seleccionada';
}

function unicoOVacio(ids?: string[]): string {
  return ids?.length === 1 ? ids[0]! : '';
}

/** Flags del plan encendidos sin N:N en el maestro. */
export function mensajesPlanSinConfig(cuenta: CuentaPlanDim | undefined): string[] {
  if (!cuenta) return [];
  const label = etiquetaCuenta(cuenta);
  const out: string[] = [];
  if (cuenta.requiereCc && !(cuenta.centroCostoIds?.length)) {
    out.push(
      `La cuenta ${label} exige centro de costo, pero el plan no tiene centros ligados. Configúralos en Contabilidad › Plan de cuentas.`,
    );
  }
  if (cuenta.requiereArea && !(cuenta.areaNegocioIds?.length)) {
    out.push(
      `La cuenta ${label} exige área de negocio, pero el plan no tiene áreas ligadas. Configúralos en Contabilidad › Plan de cuentas.`,
    );
  }
  if (cuenta.requiereElemento && !(cuenta.elementoCostoIds?.length)) {
    out.push(
      `La cuenta ${label} exige elemento de costo, pero el plan no tiene elementos ligados. Configúralos en Contabilidad › Plan de cuentas.`,
    );
  }
  return out;
}

export function prefillDimensionesPlan(cuenta: CuentaPlanDim | undefined): {
  centroCostoId: string;
  areaNegocioId: string;
  elementoCostoId: string;
} {
  if (!cuenta) {
    return { centroCostoId: '', areaNegocioId: '', elementoCostoId: '' };
  }
  return {
    centroCostoId: cuenta.requiereCc ? unicoOVacio(cuenta.centroCostoIds) : '',
    areaNegocioId: cuenta.requiereArea ? unicoOVacio(cuenta.areaNegocioIds) : '',
    elementoCostoId: cuenta.requiereElemento ? unicoOVacio(cuenta.elementoCostoIds) : '',
  };
}

/** Si el plan exige la dimensión, el combo solo muestra lo ligado. */
export function opcionesLigadasAlPlan(
  todas: OptionPlan[],
  exige: boolean | undefined,
  ligados?: string[],
): OptionPlan[] {
  if (!exige) return todas;
  if (!ligados?.length) return [];
  const allow = new Set(ligados);
  return todas.filter((o) => allow.has(o.value));
}

export function faltanDimensionesPlan(
  cuenta: CuentaPlanDim | undefined,
  form: { centroCostoId: string; areaNegocioId: string; elementoCostoId: string },
): string | null {
  if (!cuenta) return null;
  const sinConfig = mensajesPlanSinConfig(cuenta);
  if (sinConfig.length) return sinConfig[0]!;
  if (cuenta.requiereCc && !form.centroCostoId.trim()) {
    return `La cuenta ${etiquetaCuenta(cuenta)} exige centro de costo`;
  }
  if (cuenta.requiereArea && !form.areaNegocioId.trim()) {
    return `La cuenta ${etiquetaCuenta(cuenta)} exige área de negocio`;
  }
  if (cuenta.requiereElemento && !form.elementoCostoId.trim()) {
    return `La cuenta ${etiquetaCuenta(cuenta)} exige elemento de costo`;
  }
  return null;
}
