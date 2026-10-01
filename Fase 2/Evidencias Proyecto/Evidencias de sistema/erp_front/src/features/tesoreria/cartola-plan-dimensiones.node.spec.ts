import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  faltanDimensionesPlan,
  mensajesPlanSinConfig,
  opcionesLigadasAlPlan,
  prefillDimensionesPlan,
} from './cartola-plan-dimensiones.ts';

const gasto = {
  codigo: '5-1-01-01',
  nombre: 'Combustible',
  requiereCc: true,
  requiereArea: true,
  requiereElemento: false,
  centroCostoIds: ['CC-1', 'CC-2'],
  areaNegocioIds: ['AN-1'],
};

describe('mensajesPlanSinConfig', () => {
  it('avisa si exige CC sin centros ligados', () => {
    const msgs = mensajesPlanSinConfig({
      codigo: '5-1-01-01',
      nombre: 'Combustible',
      requiereCc: true,
      centroCostoIds: [],
    });
    assert.equal(msgs.length, 1);
    assert.match(msgs[0]!, /exige centro de costo/);
    assert.match(msgs[0]!, /no tiene centros ligados/);
  });

  it('vacío si no exige o si hay N:N', () => {
    assert.deepEqual(mensajesPlanSinConfig({ requiereCc: false }), []);
    assert.deepEqual(mensajesPlanSinConfig(gasto), []);
  });
});

describe('prefillDimensionesPlan', () => {
  it('prellena el único valor ligado', () => {
    assert.deepEqual(prefillDimensionesPlan(gasto), {
      centroCostoId: '',
      areaNegocioId: 'AN-1',
      elementoCostoId: '',
    });
  });
});

describe('opcionesLigadasAlPlan', () => {
  const todas = [
    { value: 'CC-1', label: 'A' },
    { value: 'CC-9', label: 'X' },
  ];
  it('filtra a lo ligado cuando exige', () => {
    assert.deepEqual(opcionesLigadasAlPlan(todas, true, ['CC-1']), [{ value: 'CC-1', label: 'A' }]);
  });
  it('combo vacío si exige y el plan no liga nada', () => {
    assert.deepEqual(opcionesLigadasAlPlan(todas, true, []), []);
  });
  it('sin flag deja el maestro completo', () => {
    assert.deepEqual(opcionesLigadasAlPlan(todas, false, ['CC-1']), todas);
  });
});

describe('faltanDimensionesPlan', () => {
  it('bloquea confirmar si falta elegir CC', () => {
    const msg = faltanDimensionesPlan(gasto, {
      centroCostoId: '',
      areaNegocioId: 'AN-1',
      elementoCostoId: '',
    });
    assert.match(msg ?? '', /exige centro de costo/);
  });
});
