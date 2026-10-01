export const CONTRATISTAS_PERMISSIONS = {
  read: 'contratistas:read',
  capture: 'contratistas:capture',
  catalogs: 'contratistas:catalogs',
  rates: 'contratistas:rates',
  rateOverride: 'contratistas:rate-override',
  finalize: 'contratistas:finalize',
  invoice: 'contratistas:invoice',
  reverse: 'contratistas:reverse',
  transfer: 'contratistas:transfer',
  close: 'contratistas:close',
  reopen: 'contratistas:reopen',
  audit: 'contratistas:audit',
} as const;

export type ContratistasPermission =
  (typeof CONTRATISTAS_PERMISSIONS)[keyof typeof CONTRATISTAS_PERMISSIONS];
