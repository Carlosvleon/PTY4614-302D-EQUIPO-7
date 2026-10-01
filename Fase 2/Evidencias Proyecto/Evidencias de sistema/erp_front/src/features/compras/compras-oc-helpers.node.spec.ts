import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ocDepartamentoDesdeGrupo,
  ocSolicitanteDesdeSesion,
  ocTipoCambioSugerido,
  ocEquivalenteClp,
  fmtMontoMoneda,
} from './compras-oc-helpers.ts';

describe('ocSolicitanteDesdeSesion', () => {
  it('usa el nombre de sesión y no deja vacío si hay usuario', () => {
    assert.equal(ocSolicitanteDesdeSesion({ nombre: '  Ana Pérez  ' }), 'Ana Pérez');
  });

  it('cae al fallback si no hay sesión', () => {
    assert.equal(ocSolicitanteDesdeSesion(null, 'persistido'), 'persistido');
    assert.equal(ocSolicitanteDesdeSesion({ nombre: '  ' }), '');
  });
});

describe('ocDepartamentoDesdeGrupo', () => {
  it('usa el nombre del grupo Compras', () => {
    assert.equal(
      ocDepartamentoDesdeGrupo({ id: 'GRP-1', nombre: '  Packing  ' }),
      'Packing',
    );
  });

  it('queda vacío si preview no trajo grupo', () => {
    assert.equal(ocDepartamentoDesdeGrupo(null), '');
    assert.equal(ocDepartamentoDesdeGrupo(undefined, 'viejo'), 'viejo');
  });
});

describe('multimoneda compras helpers', () => {
  const mockKpi = {
    tcUsdHoy: 965.71,
    tcEurHoy: 1098.15,
    tcCnyHoy: 143.79,
    tcUsdHoyFecha: '2026-09-25T00:00:00.000Z',
  };

  it('ocTipoCambioSugerido retorna null para CLP', () => {
    assert.equal(ocTipoCambioSugerido('CLP', mockKpi), null);
    assert.equal(ocTipoCambioSugerido('', mockKpi), null);
  });

  it('ocTipoCambioSugerido resuelve USD, EUR y CNY', () => {
    assert.deepEqual(ocTipoCambioSugerido('USD', mockKpi), {
      fecha: '2026-09-25',
      valor: 965.71,
    });
    assert.deepEqual(ocTipoCambioSugerido('EUR', mockKpi), {
      fecha: '2026-09-25',
      valor: 1098.15,
    });
    assert.deepEqual(ocTipoCambioSugerido('CNY', mockKpi), {
      fecha: '2026-09-25',
      valor: 143.79,
    });
  });

  it('ocEquivalenteClp convierte montos extranjeros a CLP redondeado', () => {
    assert.equal(ocEquivalenteClp(1000, 'CLP', mockKpi), 1000);
    // 1500 USD * 965.71 = 1,448,565 CLP
    assert.equal(ocEquivalenteClp(1500, 'USD', mockKpi), 1448565);
    // 500 EUR * 1098.15 = 549,075 CLP
    assert.equal(ocEquivalenteClp(500, 'EUR', mockKpi), 549075);
  });

  it('fmtMontoMoneda formatea según moneda', () => {
    assert.match(fmtMontoMoneda(1500, 'CLP'), /1\.500/);
    assert.match(fmtMontoMoneda(1500, 'USD'), /1,500/);
  });
});

