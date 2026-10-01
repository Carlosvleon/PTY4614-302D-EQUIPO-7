import { BadRequestException } from '@nestjs/common';

export type DomicilioFiscal = {
  direccion: string;
  comuna: string;
  ciudad: string;
};

type DirFicha = {
  linea?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  principal?: boolean;
};

/** DTE nacional (33/34/52/56/61): SII exige DirRecep y CmnaRecep. */
export const TIPOS_DTE_EXIGEN_DOMICILIO_RECEPTOR = new Set([33, 34, 52, 56, 61]);

export function resolveDomicilioFiscal(input: {
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  direcciones?: DirFicha[] | null;
}): DomicilioFiscal | null {
  const ficha =
    input.direcciones?.find((d) => d.principal && d.linea?.trim())
    ?? input.direcciones?.find((d) => d.linea?.trim());
  const direccion = (input.direccion || ficha?.linea || '').trim();
  const comuna = (input.comuna || ficha?.comuna || '').trim();
  const ciudad = (input.ciudad || ficha?.ciudad || comuna).trim();
  if (direccion.length < 3 || comuna.length < 2) return null;
  return { direccion, comuna, ciudad };
}

export function assertDomicilioFiscalCliente(input: {
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  direcciones?: DirFicha[] | null;
}): DomicilioFiscal {
  const row = resolveDomicilioFiscal(input);
  if (!row) {
    throw new BadRequestException(
      'El cliente debe tener dirección fiscal y comuna. El SII rechaza el DTE sin DirRecep/CmnaRecep.',
    );
  }
  return row;
}
