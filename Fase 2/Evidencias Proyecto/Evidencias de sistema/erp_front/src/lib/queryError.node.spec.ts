import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  queryErrorMessage,
  isSilentAuthzError,
  shouldContinueQueryPolling,
  shouldNotifyQueryError,
  shouldRetryQuery,
} from './queryError.ts';

function httpError(status: number, message = 'detalle interno sensible'): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('infraestructura de errores de queries', () => {
  it('no reintenta ni continúa polling después de 401/403', () => {
    for (const status of [401, 403]) {
      const error = httpError(status);
      assert.equal(isSilentAuthzError(error), true);
      assert.equal(shouldRetryQuery(0, error), false);
      assert.equal(shouldContinueQueryPolling(error), false);
    }
    assert.equal(shouldContinueQueryPolling(httpError(500)), true);
    assert.equal(isSilentAuthzError(httpError(500)), false);
  });

  it('el mensaje de 403 explica el rechazo (para imputación OC visible)', () => {
    const message = queryErrorMessage(httpError(403), 'las cuentas y elementos de costo');
    assert.equal(message.includes('No tienes permiso'), true);
    assert.equal(message.includes('las cuentas y elementos de costo'), true);
  });

  it('deduplica por queryHash/status durante el cooldown', () => {
    const error = httpError(500);
    assert.equal(shouldNotifyQueryError('polling-test', error, undefined, 1_000, 60_000), true);
    assert.equal(shouldNotifyQueryError('polling-test', error, undefined, 10_000, 60_000), false);
    assert.equal(shouldNotifyQueryError('polling-test', error, undefined, 61_001, 60_000), true);
  });

  it('no bloquea ni avisa si existe data cacheada', () => {
    assert.equal(
      shouldNotifyQueryError('cached-test', httpError(500), [], 1_000, 60_000),
      false,
    );
  });

  it('no expone mensajes arbitrarios de respuestas 4xx', () => {
    const message = queryErrorMessage(httpError(400), 'las órdenes');
    assert.equal(message.includes('detalle interno sensible'), false);
    assert.equal(message, 'No se pudieron consultar las órdenes porque la solicitud no es válida.');
  });
});
