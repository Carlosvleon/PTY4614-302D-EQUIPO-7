import { BadRequestException } from '@nestjs/common';
import type { CanonicalDocumentV1, TenantBillingConfig } from '../../common/types';

export function gosocketEnvCredentialSuffix(erpId: string, empresaId: string): string {
  return `${erpId}_${empresaId}`
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
}

function credentialPair(
  user?: string | null,
  password?: string | null,
): { user: string; password: string } | null {
  const u = user?.trim() ?? '';
  const p = password?.trim() ?? '';
  if (u && p) return { user: u, password: p };
  return null;
}

export function requireGoSocketCredentials(): { user: string; password: string } {
  const pair = credentialPair(
    process.env.GOSOCKET_API_USER,
    process.env.GOSOCKET_API_PASSWORD,
  );
  if (!pair) {
    throw new BadRequestException(
      'GoSocket sandbox/live requiere GOSOCKET_API_USER y GOSOCKET_API_PASSWORD en .env (o el par por empresa GOSOCKET_API_USER_{ERP}_{EMPRESA})',
    );
  }
  return pair;
}

/**
 * ApiUser/password de una sociedad sin documento canónico (inbox de compras).
 * 1) .env GOSOCKET_API_USER_{ERP}_{EMPRESA}  p.ej. ALMAHUE_EMP_SERVICES
 * 2) registry tenants.local.json (apiUser/apiPassword, gitignored)
 * 3) par global GOSOCKET_API_USER / GOSOCKET_API_PASSWORD
 */
export function resolveGoSocketCredentialsForEmpresa(
  erpId: string,
  empresaId: string | undefined,
  tenant?: TenantBillingConfig,
): { user: string; password: string } {
  const empresa = empresaId?.trim() ?? '';
  if (erpId.trim() && empresa) {
    const suffix = gosocketEnvCredentialSuffix(erpId, empresa);
    const fromEnvEmpresa = credentialPair(
      process.env[`GOSOCKET_API_USER_${suffix}`],
      process.env[`GOSOCKET_API_PASSWORD_${suffix}`],
    );
    if (fromEnvEmpresa) return fromEnvEmpresa;
  }

  const fromTenant = credentialPair(tenant?.apiUser, tenant?.apiPassword);
  if (fromTenant) return fromTenant;

  return requireGoSocketCredentials();
}

/**
 * ApiUser/password por sociedad.
 * 1) canónico (Postman/QA; el ERP no lo envía)
 * 2) .env por empresa, registry local, o el par global
 */
export function resolveGoSocketCredentials(
  doc: CanonicalDocumentV1,
  tenant?: TenantBillingConfig,
): { user: string; password: string } {
  const fromDoc = credentialPair(doc.source.apiUser, doc.source.apiPassword);
  if (fromDoc) return fromDoc;
  return resolveGoSocketCredentialsForEmpresa(doc.source.erpId, doc.source.empresaId, tenant);
}
