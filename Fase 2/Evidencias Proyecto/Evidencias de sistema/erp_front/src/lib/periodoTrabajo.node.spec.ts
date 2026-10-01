import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { periodoMenuEstadoLabel, syncPeriodoPreferido } from './periodoTrabajo.ts';

describe('periodoMenuEstadoLabel', () => {
  it('distingue ABIERTO de preferido', () => {
    assert.equal(periodoMenuEstadoLabel({ estado: 'ABIERTO' }), 'ABIERTO');
    assert.equal(periodoMenuEstadoLabel({ estado: 'ABIERTO', activo: true }), 'ABIERTO · preferido');
  });

  it('sin periodo en BD', () => {
    assert.equal(periodoMenuEstadoLabel(undefined), 'Sin crear');
  });
});

describe('syncPeriodoPreferido', () => {
  it('no llama al API si ya es preferido', async () => {
    let called = 0;
    const changed = await syncPeriodoPreferido({ id: 'P1', activo: true }, async () => {
      called += 1;
    });
    assert.equal(changed, false);
    assert.equal(called, 0);
  });

  it('marca preferido si aún no lo es', async () => {
    const calls: string[] = [];
    const changed = await syncPeriodoPreferido({ id: 'P2', activo: false }, async (id) => {
      calls.push(id);
    });
    assert.equal(changed, true);
    assert.deepEqual(calls, ['P2']);
  });
});

