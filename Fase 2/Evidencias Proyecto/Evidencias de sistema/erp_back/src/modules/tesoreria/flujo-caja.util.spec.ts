import { esBancoApertura, inferMonedaBanco, matchesMonedaFiltro, normalizeMonedaCodigo } from './flujo-caja.util';

describe('flujo-caja.util', () => {
  it('normaliza YUAN a CNY', () => {
    expect(normalizeMonedaCodigo('yuan')).toBe('CNY');
    expect(normalizeMonedaCodigo('')).toBe('CLP');
  });

  it('filtro Yuan acepta CNY', () => {
    expect(matchesMonedaFiltro('CNY', 'YUAN')).toBe(true);
    expect(matchesMonedaFiltro('CLP', 'USD')).toBe(false);
    expect(matchesMonedaFiltro('USD', undefined)).toBe(true);
  });

  it('apertura solo acepta los bancos de la cartola', () => {
    expect(esBancoApertura('Banco Chile')).toBe(true);
    expect(esBancoApertura(' Banco Estado ')).toBe(true);
    expect(esBancoApertura('Chile')).toBe(false);
    expect(esBancoApertura('banco chile')).toBe(false);
  });

  it('infiere moneda; default CLP', () => {
    expect(inferMonedaBanco('Banco Estado')).toBe('CLP');
    expect(inferMonedaBanco('Banco Chile USD')).toBe('USD');
    expect(inferMonedaBanco('Banco China Yuan')).toBe('CNY');
  });
});
