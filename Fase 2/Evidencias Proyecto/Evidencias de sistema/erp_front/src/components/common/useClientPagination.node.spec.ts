import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePageSize, pageSizeLimit } from './useClientPagination.ts';

describe('paginación client-side', () => {
  it('el select HTML entrega strings y no debe concatenar offset', () => {
    assert.equal(parsePageSize('5'), 5);
    assert.equal(parsePageSize('15'), 15);
    assert.equal(parsePageSize('all'), 'all');
    const limit = pageSizeLimit(parsePageSize('5'), 57);
    assert.equal(0 + limit, 5);
    assert.equal(5 + limit, 10);
    assert.notEqual(String(0) + String('5'), String(0 + limit));
  });
});
