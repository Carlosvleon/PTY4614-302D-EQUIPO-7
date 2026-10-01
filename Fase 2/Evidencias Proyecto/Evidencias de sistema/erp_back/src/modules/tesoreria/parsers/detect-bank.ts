import type { BankParser, BankParserInput, CartolaParseResult } from './types';
import { FORMATO_NO_RECONOCIDO } from './types';
import { almahueWebParser } from './almahue-web';
import { bancoChileParser } from './banco-chile';
import { bancoEstadoParser } from './banco-estado';
import { santanderParser } from './santander';

/** Almahue-web primero: detecta workbook multi-hoja MJ antes que stubs genéricos. */
const PARSERS: BankParser[] = [
  almahueWebParser,
  bancoChileParser,
  bancoEstadoParser,
  santanderParser,
];

export function detectBank(input: BankParserInput): BankParser | null {
  return PARSERS.find((p) => p.detect(input)) ?? null;
}

export async function tryParseBankSpecific(
  input: BankParserInput,
): Promise<{ banco: BankParser; result: CartolaParseResult } | null> {
  for (const bank of PARSERS) {
    if (!bank.detect(input)) continue;
    const result = await bank.parse(input);
    if (!result) continue;
    return {
      banco: bank,
      result: {
        ...result,
        bancoDetectado: bank.id,
        formatoDetectado: result.formatoDetectado || bank.id,
      },
    };
  }
  return null;
}

export function avisoFormatoNoReconocido(avisos: string[]): string[] {
  if (avisos.some((a) => a.includes('Formato no reconocido'))) return avisos;
  return [...avisos, FORMATO_NO_RECONOCIDO];
}

export { PARSERS as BANK_PARSERS };
