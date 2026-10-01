import {
  PublicClientApplication,
  type AuthenticationResult,
  type Configuration,
} from '@azure/msal-browser';
import { withBasePath } from '@/lib/basePath';

export type MicrosoftAuthPublicConfig = {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  authority: string;
};

let pca: PublicClientApplication | null = null;
let pcaKey = '';

/** Redirect SPA: respeta subpath prod (`/almahue-erp/login`) o local (`/login`). */
export function microsoftRedirectUri(): string {
  const path = withBasePath('/login');
  return `${window.location.origin}${path}`;
}

function buildConfig(cfg: MicrosoftAuthPublicConfig): Configuration {
  const redirectUri = microsoftRedirectUri();
  return {
    auth: {
      clientId: cfg.clientId,
      authority: cfg.authority || `https://login.microsoftonline.com/${cfg.tenantId}`,
      redirectUri,
      postLogoutRedirectUri: redirectUri,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  };
}

async function getPca(cfg: MicrosoftAuthPublicConfig): Promise<PublicClientApplication> {
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  if (pca && pcaKey === key) return pca;
  pca = new PublicClientApplication(buildConfig(cfg));
  pcaKey = key;
  await pca.initialize();
  return pca;
}

/**
 * Abre popup Microsoft Entra y devuelve el id_token para canjear en el ERP.
 */
export async function acquireMicrosoftIdToken(
  cfg: MicrosoftAuthPublicConfig,
): Promise<string> {
  if (!cfg.enabled || !cfg.clientId || !cfg.tenantId) {
    throw new Error('Microsoft no está configurado en este ambiente.');
  }
  const app = await getPca(cfg);
  const request = {
    scopes: ['openid', 'profile', 'email'],
    prompt: 'select_account' as const,
  };

  let result: AuthenticationResult;
  try {
    const accounts = app.getAllAccounts();
    if (accounts.length === 1) {
      try {
        result = await app.acquireTokenSilent({ ...request, account: accounts[0] });
      } catch {
        result = await app.loginPopup(request);
      }
    } else {
      result = await app.loginPopup(request);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Login Microsoft cancelado o fallido';
    throw new Error(msg);
  }

  const idToken = result.idToken;
  if (!idToken) {
    throw new Error('Microsoft no devolvió id_token. Revisa redirect URI y tipo SPA.');
  }
  return idToken;
}
