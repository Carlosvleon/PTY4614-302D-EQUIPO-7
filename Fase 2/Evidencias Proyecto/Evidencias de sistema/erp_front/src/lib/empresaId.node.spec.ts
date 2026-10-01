import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCatalogEmpresaId } from './empresaId.ts';

const HOLDING = ['EMP-BOOT', 'EMP-EXPORT', 'EMP-SERVICES'];

describe('resolveCatalogEmpresaId', () => {
  it('mantiene EMP-1 si sigue en el catálogo (prod / seed-demo-real)', () => {
    assert.equal(resolveCatalogEmpresaId('EMP-1', ['EMP-1', 'EMP-2'], 'EMP-1'), 'EMP-1');
  });

  it('aliasa EMP-1 → EMP-EXPORT cuando el catálogo es holding QA', () => {
    assert.equal(resolveCatalogEmpresaId('EMP-1', HOLDING, 'EMP-EXPORT'), 'EMP-EXPORT');
  });

  it('aliasa EMP-2 → EMP-SERVICES', () => {
    assert.equal(resolveCatalogEmpresaId('EMP-2', HOLDING, 'EMP-EXPORT'), 'EMP-SERVICES');
  });

  it('respeta la empresa seleccionada si está en el catálogo', () => {
    assert.equal(resolveCatalogEmpresaId('EMP-SERVICES', HOLDING, 'EMP-EXPORT'), 'EMP-SERVICES');
  });

  it('sin catálogo no inventa el alias', () => {
    assert.equal(resolveCatalogEmpresaId('EMP-1', [], 'EMP-EXPORT'), 'EMP-1');
  });
});
