export const EXPORT_RECEIVER_RUT = '55555555-5';
export const FOREIGN_RECEIVER_ID_MAX_LENGTH = 50;

const FOREIGN_RECEIVER_ID_PATTERN = /^EX-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function isForeignReceiverId(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length <= FOREIGN_RECEIVER_ID_MAX_LENGTH
    && FOREIGN_RECEIVER_ID_PATTERN.test(value)
  );
}

export function looksLikeForeignReceiverId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().toUpperCase().startsWith('EX-');
}
