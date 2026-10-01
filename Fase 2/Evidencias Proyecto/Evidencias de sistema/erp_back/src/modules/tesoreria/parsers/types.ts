export type MovimientoCartolaParsed = {
  fecha: string;
  referencia: string;
  glosa: string;
  monto: number;
  tipo: 'INGRESO' | 'EGRESO';
  cargo?: number;
  abono?: number;
  saldo?: number;
  hoja?: string;
};

export type CartolaHojaResumen = {
  nombre: string;
  movimientos: number;
};

export type CartolaParseResult = {
  lineas: MovimientoCartolaParsed[];
  avisos: string[];
  formatoDetectado: string;
  bancoDetectado?: string;
  hojas?: CartolaHojaResumen[];
  suggestedPeriodo?: string;
  suggestedMesContable?: string;
};

export type BankParserInput = {
  buffer: Buffer;
  filename: string;
  textHint?: string;
};

export type BankParser = {
  id: string;
  label: string;
  /** true si el archivo parece de este banco */
  detect: (input: BankParserInput) => boolean;
  /** null si no puede parsear → caer a genérico */
  parse: (input: BankParserInput) => CartolaParseResult | null | Promise<CartolaParseResult | null>;
};

export const FORMATO_NO_RECONOCIDO =
  'Formato no reconocido — adjunte muestra al equipo (banco + PDF/Excel real). '
  + 'El parser genérico espera CSV/Excel con fecha+glosa+monto o PDF con texto seleccionable.';
