import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { UnauthorizedException } from '@nestjs/common';

export type MicrosoftIdClaims = JWTPayload & {
  oid?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  tid?: string;
};

let jwksCache: { tenantId: string; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null;

function getJwks(tenantId: string) {
  if (jwksCache?.tenantId === tenantId) return jwksCache.jwks;
  const url = new URL(
    `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  );
  const jwks = createRemoteJWKSet(url);
  jwksCache = { tenantId, jwks };
  return jwks;
}

/**
 * Valida id_token de Entra ID (OIDC v2).
 * Audience = Application (client) ID de la SPA.
 */
export async function verifyMicrosoftIdToken(
  idToken: string,
  opts: { tenantId: string; clientId: string; issuer?: string },
): Promise<MicrosoftIdClaims> {
  const issuer =
    opts.issuer
    || `https://login.microsoftonline.com/${opts.tenantId}/v2.0`;
  try {
    const { payload } = await jwtVerify(idToken, getJwks(opts.tenantId), {
      issuer,
      audience: opts.clientId,
    });
    return payload as MicrosoftIdClaims;
  } catch {
    throw new UnauthorizedException(
      'Token Microsoft inválido o expirado. Vuelve a iniciar sesión con Microsoft.',
    );
  }
}

export function emailFromMicrosoftClaims(claims: MicrosoftIdClaims): string | null {
  const raw = (claims.preferred_username || claims.email || '').trim().toLowerCase();
  return raw.includes('@') ? raw : null;
}
