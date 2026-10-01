import { ConfigService } from '@nestjs/config';
import { getRequiredJwtSecret } from './jwt-secret.util';

function configWith(secret: string | undefined): ConfigService {
  return { get: jest.fn(() => secret) } as unknown as ConfigService;
}

describe('getRequiredJwtSecret', () => {
  it('exige un secreto presente', () => {
    expect(() => getRequiredJwtSecret(configWith(undefined))).toThrow(/JWT_SECRET/);
    expect(() => getRequiredJwtSecret(configWith('   '))).toThrow(/JWT_SECRET/);
  });

  it('rechaza placeholders y secretos cortos', () => {
    expect(() => getRequiredJwtSecret(configWith('fallback-secret'))).toThrow(/placeholder/);
    expect(() => getRequiredJwtSecret(configWith('change-me'))).toThrow(/32/);
    expect(() => getRequiredJwtSecret(configWith('corto-pero-no-placeholder'))).toThrow(/32/);
  });

  it('acepta un secreto de 32+ caracteres', () => {
    const secret = 'change-me-in-production-use-a-long-random-string';
    expect(getRequiredJwtSecret(configWith(secret))).toBe(secret);
  });
});
