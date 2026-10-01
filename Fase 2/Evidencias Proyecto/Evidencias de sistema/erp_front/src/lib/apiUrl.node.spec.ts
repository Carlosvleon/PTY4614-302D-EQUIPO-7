import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApiUrl } from './apiUrl.ts';

describe('buildApiUrl', () => {
  it('arma /api/v1/periodos-contables', () => {
    assert.equal(buildApiUrl('periodos-contables', '/api/v1'), '/api/v1/periodos-contables');
  });

  it('no duplica si la URL ya viene prefijada (retry 401)', () => {
    assert.equal(
      buildApiUrl('/api/v1/periodos-contables', '/api/v1'),
      '/api/v1/periodos-contables',
    );
  });

  it('respeta VITE_API_URL absoluto', () => {
    assert.equal(
      buildApiUrl('periodos-contables', 'http://localhost:3001/api/v1'),
      'http://localhost:3001/api/v1/periodos-contables',
    );
  });
});
