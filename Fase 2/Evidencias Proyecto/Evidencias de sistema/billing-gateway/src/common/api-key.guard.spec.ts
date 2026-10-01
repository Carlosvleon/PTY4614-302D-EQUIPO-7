import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  ApiKeyGuard,
  assertApiKeyConfiguration,
  parseAllowedKeys,
  type BillingAuthRequest,
} from './api-key.guard';

function contextFor(key?: string): { context: ExecutionContext; request: BillingAuthRequest } {
  const request = {
    headers: key ? { 'x-billing-api-key': key } : {},
  } as BillingAuthRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  return { context, request };
}

describe('ApiKeyGuard', () => {
  const original = process.env.BILLING_API_KEYS;
  const validKey = 'unit-key-A1B2C3D4E5F6G7H8I9J0-KLMNOP';

  afterEach(() => {
    if (original === undefined) delete process.env.BILLING_API_KEYS;
    else process.env.BILLING_API_KEYS = original;
  });

  it('falla configuración cuando BILLING_API_KEYS no existe', () => {
    expect(() => assertApiKeyConfiguration(undefined)).toThrow(/BILLING_API_KEYS/);
  });

  it('ignora claves sin binding key@erpId', () => {
    expect(parseAllowedKeys('sin-binding, ,otra@')).toEqual([]);
    expect(() => assertApiKeyConfiguration('sin-binding')).toThrow(/key@erpId/);
  });

  it('rechaza claves cortas y placeholders conocidos', () => {
    expect(() => assertApiKeyConfiguration('corta@almahue')).toThrow(/32/);
    expect(() => assertApiKeyConfiguration('almahue-demo-key@almahue')).toThrow(/32/);
    expect(() =>
      assertApiKeyConfiguration('placeholder-0123456789-ABCDEFGHIJK@almahue'),
    ).toThrow(/placeholder/);
  });

  it('rechaza una misma clave duplicada aunque cambie el erpId', () => {
    expect(() =>
      assertApiKeyConfiguration(`${validKey}@almahue,${validKey}@otro-erp`),
    ).toThrow(/duplicadas/);
  });

  it('acepta una clave suficientemente larga y no predecible', () => {
    expect(() => assertApiKeyConfiguration(`${validKey}@almahue`)).not.toThrow();
  });

  it('autoriza una key configurada y liga el erpId', () => {
    process.env.BILLING_API_KEYS = `${validKey}@almahue`;
    const { context, request } = contextFor(validKey);
    expect(new ApiKeyGuard().canActivate(context)).toBe(true);
    expect(request.billingErpId).toBe('almahue');
  });

  it('no usa fallback demo y rechaza una key desconocida', () => {
    delete process.env.BILLING_API_KEYS;
    const { context } = contextFor('almahue-demo-key');
    expect(() => new ApiKeyGuard().canActivate(context)).toThrow(UnauthorizedException);
  });
});
