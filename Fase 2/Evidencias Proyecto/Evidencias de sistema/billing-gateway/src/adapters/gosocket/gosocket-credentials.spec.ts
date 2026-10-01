import type { CanonicalDocumentV1, TenantBillingConfig } from '../../common/types';
import {
  gosocketEnvCredentialSuffix,
  resolveGoSocketCredentials,
  resolveGoSocketCredentialsForEmpresa,
} from './gosocket-credentials';

function doc(empresaId = 'EMP-SERVICES'): CanonicalDocumentV1 {
  return {
    schemaVersion: '1.0',
    idempotencyKey: 'k',
    source: { erpId: 'almahue', empresaId, documentoId: 'd1' },
    emisor: { rut: '77.032.639-7', razonSocial: 'ALM' },
    receptor: { rut: '77.032.638-9', razonSocial: 'EXP' },
    documento: { tipoDte: 33, fechaEmision: '2026-09-17', numeroInterno: '1' },
    totales: { neto: 1, iva: 0, total: 1 },
    lineas: [{ nro: 1, descripcion: 'x', cantidad: 1, precio: 1, montoNeto: 1 }],
  };
}

const tenant: TenantBillingConfig = {
  erpId: 'almahue',
  rutEmisor: '*',
  partner: 'gosocket',
  connectionMode: 'sandbox',
  activo: true,
};

describe('GoSocket credentials por empresa', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('slug env ALMAHUE_EMP_SERVICES', () => {
    expect(gosocketEnvCredentialSuffix('almahue', 'EMP-SERVICES')).toBe(
      'ALMAHUE_EMP_SERVICES',
    );
    expect(gosocketEnvCredentialSuffix('almahue', 'EMP-EXPORT')).toBe('ALMAHUE_EMP_EXPORT');
  });

  it('prioriza ApiUser del canónico (Postman)', () => {
    process.env.GOSOCKET_API_USER = 'global-user';
    process.env.GOSOCKET_API_PASSWORD = 'global-pass';
    const withAuth = doc();
    withAuth.source.apiUser = '00000000-0000-4000-8000-000000000002';
    withAuth.source.apiPassword = 'clave-alm';
    expect(resolveGoSocketCredentials(withAuth, tenant)).toEqual({
      user: '00000000-0000-4000-8000-000000000002',
      password: 'clave-alm',
    });
  });

  it('usa el par del .env de esa empresa y no el global', () => {
    process.env.GOSOCKET_API_USER = 'user-export';
    process.env.GOSOCKET_API_PASSWORD = 'pass-export';
    process.env.GOSOCKET_API_USER_ALMAHUE_EMP_SERVICES = 'user-alm';
    process.env.GOSOCKET_API_PASSWORD_ALMAHUE_EMP_SERVICES = 'pass-alm';
    expect(resolveGoSocketCredentials(doc('EMP-SERVICES'), tenant)).toEqual({
      user: 'user-alm',
      password: 'pass-alm',
    });
    expect(resolveGoSocketCredentials(doc('EMP-EXPORT'), tenant)).toEqual({
      user: 'user-export',
      password: 'pass-export',
    });
  });

  it('compras usa el par de la empresa y no el ApiUser global', () => {
    process.env.GOSOCKET_API_USER = 'user-export';
    process.env.GOSOCKET_API_PASSWORD = 'pass-export';
    process.env.GOSOCKET_API_USER_ALMAHUE_EMP_SERVICES = 'user-alm';
    process.env.GOSOCKET_API_PASSWORD_ALMAHUE_EMP_SERVICES = 'pass-alm';
    expect(resolveGoSocketCredentialsForEmpresa('almahue', 'EMP-SERVICES', tenant)).toEqual({
      user: 'user-alm',
      password: 'pass-alm',
    });
    expect(resolveGoSocketCredentialsForEmpresa('almahue', 'EMP-EXPORT', tenant)).toEqual({
      user: 'user-export',
      password: 'pass-export',
    });
  });

  it('cae al registry local si no hay env por empresa', () => {
    delete process.env.GOSOCKET_API_USER;
    delete process.env.GOSOCKET_API_PASSWORD;
    const withCreds: TenantBillingConfig = {
      ...tenant,
      apiUser: 'from-registry',
      apiPassword: 'from-registry-pass',
    };
    expect(resolveGoSocketCredentials(doc(), withCreds)).toEqual({
      user: 'from-registry',
      password: 'from-registry-pass',
    });
  });
});
