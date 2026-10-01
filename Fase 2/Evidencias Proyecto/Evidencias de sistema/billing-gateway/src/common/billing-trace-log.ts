import { Logger } from '@nestjs/common';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

const LOG_MAX_CHARS = 80_000;

export type BillingTraceKind = 'inbound' | 'outbound' | 'response';

const TITLES: Record<BillingTraceKind, string> = {
  inbound: 'BILLING INBOUND  ERP → gateway',
  outbound: 'GOSOCKET OUTBOUND  gateway → partner',
  response: 'GOSOCKET RESPONSE  partner → gateway',
};

export function logBillingTrace(
  logger: Logger,
  kind: BillingTraceKind,
  payload: unknown,
  options: { rejected?: boolean } = {},
): void {
  const color =
    kind === 'inbound'
      ? CYAN
      : kind === 'outbound'
        ? YELLOW
        : options.rejected
          ? RED
          : GREEN;
  const title = TITLES[kind];
  const body = safePretty(payload);
  const block = [
    `${color}${BOLD}`,
    `════════ ${title} ════════`,
    RESET + color,
    body,
    `${BOLD}════════════════════════════════════${RESET}`,
  ].join('\n');

  if (options.rejected) {
    logger.warn(block);
    return;
  }
  logger.log(block);
}

export function safePretty(payload: unknown): string {
  const text = JSON.stringify(redactSecrets(payload), null, 2) ?? 'null';
  if (text.length <= LOG_MAX_CHARS) return text;
  return `${text.slice(0, LOG_MAX_CHARS)}\n…[truncated ${text.length - LOG_MAX_CHARS} chars]`;
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      /password|secret|authorization|api[_-]?key|^token$|base64content|filecontent/i.test(
        key,
      )
    ) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = redactSecrets(item);
  }
  return out;
}
