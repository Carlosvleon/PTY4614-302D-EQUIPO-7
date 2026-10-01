/** IDs estables para demo Almahue SpA (EMP-1) — OC + OV. */
export const ALM = {
  EMP: 'EMP-1',
  /** Clientes */
  CLI_EXPORT: 'CLI-SEED-1',
  CLI_PACKING: 'CLI-SEED-1B',
  /** Proveedores */
  PROV_AGRO: 'PROV-SEED-1',
  PROV_PACK: 'PROV-SEED-2',
  PROV_QUIM: 'PROV-ALM-QUIM',
  /** Insumos */
  INS_CEREZA: 'INS-ALM-CEREZA',
  INS_CAJA: 'INS-ALM-CAJA',
  INS_UREA: 'INS-SEED-1',
  INS_PALLET: 'INS-ALM-PALLET',
  /** Bodegas (nombres AlmaWeb / packing) */
  BOD_FRIG: 'BOD-ALM-FRIG',
  BOD_PACK: 'BOD-ALM-PACK',
  BOD_MAT: 'BOD-ALM-MAT',
  BOD_DESP: 'BOD-ALM-DESP',
} as const;

export const ALM_NAMES = {
  CLI_EXPORT: 'Exportadora Frutas del Sur',
  CLI_PACKING: 'Comercial Packing Centro',
  PROV_AGRO: 'Agro Insumos Sur',
  PROV_PACK: 'Packaging Chile SpA',
  PROV_QUIM: 'Química del Valle Ltda.',
} as const;
