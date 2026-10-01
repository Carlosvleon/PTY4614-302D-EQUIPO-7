import { ConfigService } from '@nestjs/config';

const MIN_JWT_SECRET_CHARS = 32;
const FORBIDDEN_JWT_SECRETS = new Set([
  'fallback-secret',
  'changeme',
  'change-me',
  'secret',
  'jwt-secret',
  'jwt_secret',
]);

/**
 * P0-5: JWT_SECRET es obligatorio. Antes había un fallback ('fallback-secret')
 * que permitía levantar el backend en producción sin secreto real, dejando
 * los tokens firmados con un valor público y conocido.
 */
export function getRequiredJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || !secret.trim()) {
    throw new Error(
      'JWT_SECRET no está configurado. Defínelo en las variables de entorno antes de iniciar el backend.',
    );
  }
  const trimmed = secret.trim();
  const normalized = trimmed.toLowerCase();
  if (
    trimmed.length < MIN_JWT_SECRET_CHARS
    || FORBIDDEN_JWT_SECRETS.has(normalized)
  ) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${MIN_JWT_SECRET_CHARS} caracteres y no ser un placeholder.`,
    );
  }
  return trimmed;
}
