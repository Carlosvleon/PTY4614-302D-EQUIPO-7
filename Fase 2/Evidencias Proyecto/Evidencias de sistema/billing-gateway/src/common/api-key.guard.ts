import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export type BillingAuthRequest = Request & { billingErpId?: string };

interface ApiKeyEntry {
  key: string;
  erpId: string;
}

const MIN_KEY_BYTES = 32;
const MAX_KEY_BYTES = 256;
const FORBIDDEN_KEY_MARKERS = [
  'almahue-demo-key',
  'changeme',
  'change-me',
  'placeholder',
  'example',
  'demo-key',
  'your-key',
  'your_key',
];

export function parseAllowedKeys(raw = process.env.BILLING_API_KEYS): ApiKeyEntry[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      const at = item.lastIndexOf('@');
      if (at <= 0 || at === item.length - 1) return [];
      const key = item.slice(0, at).trim();
      const erpId = item.slice(at + 1).trim();
      if (!key || !/^[A-Za-z0-9._-]{1,100}$/.test(erpId)) return [];
      return [{ key, erpId }];
    });
}

export function assertApiKeyConfiguration(raw = process.env.BILLING_API_KEYS): void {
  const entries = parseAllowedKeys(raw);
  if (entries.length === 0) {
    throw new Error(
      'BILLING_API_KEYS debe contener al menos una entrada válida con formato key@erpId',
    );
  }
  if (entries.some((entry) => !isStrongApiKey(entry.key))) {
    throw new Error(
      `Cada BILLING_API_KEYS debe tener entre ${MIN_KEY_BYTES} y ${MAX_KEY_BYTES} bytes y no ser un placeholder`,
    );
  }
  if (new Set(entries.map((entry) => entry.key)).size !== entries.length) {
    throw new Error('BILLING_API_KEYS no permite claves duplicadas');
  }
}

function safeKeyEquals(candidate: string, expected: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function isStrongApiKey(key: string): boolean {
  const bytes = Buffer.byteLength(key, 'utf8');
  if (bytes < MIN_KEY_BYTES || bytes > MAX_KEY_BYTES) return false;
  if (/[\s\x00-\x1f\x7f]/.test(key)) return false;
  const normalized = key.toLowerCase();
  if (FORBIDDEN_KEY_MARKERS.some((marker) => normalized.includes(marker))) return false;
  // Evita valores de baja entropía evidentes aunque cumplan longitud.
  return new Set(key).size >= 8;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<BillingAuthRequest>();
    const key = (req.headers['x-billing-api-key'] as string | undefined)?.trim();
    const allowed = parseAllowedKeys();
    const match = key
      ? allowed.find((entry) => safeKeyEquals(key, entry.key))
      : undefined;
    if (!key || !match) {
      throw new UnauthorizedException('X-Billing-Api-Key inválida');
    }
    req.billingErpId = match.erpId;
    return true;
  }
}
