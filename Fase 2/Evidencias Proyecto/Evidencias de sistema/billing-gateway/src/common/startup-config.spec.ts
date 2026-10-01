import { resolveStartupConfig } from './startup-config';

describe('resolveStartupConfig', () => {
  const validBinding = 'startup-key-A1B2C3D4E5F6G7H8I9J0-XYZ@erp-local';

  it('falla antes de escuchar cuando no hay API keys válidas', () => {
    expect(() => resolveStartupConfig({})).toThrow(/BILLING_API_KEYS/);
    expect(() => resolveStartupConfig({ BILLING_API_KEYS: 'sin-binding' })).toThrow(
      /key@erpId/,
    );
  });

  it('desactiva CORS y liga loopback por defecto', () => {
    expect(
      resolveStartupConfig({ BILLING_API_KEYS: validBinding }),
    ).toEqual({
      port: 3040,
      host: '127.0.0.1',
      corsOrigins: [],
    });
  });

  it('acepta bind y allowlist CORS explícitos', () => {
    expect(
      resolveStartupConfig({
        BILLING_API_KEYS: validBinding,
        BILLING_BIND_HOST: '0.0.0.0',
        BILLING_CORS_ORIGINS: 'https://erp.example, https://admin.example',
        PORT: '4040',
      }),
    ).toEqual({
      port: 4040,
      host: '0.0.0.0',
      corsOrigins: ['https://erp.example', 'https://admin.example'],
    });
  });
});
