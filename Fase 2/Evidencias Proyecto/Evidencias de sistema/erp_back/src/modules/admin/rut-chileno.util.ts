import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Mismo criterio que `isValidRutChecksum` en erp_front (`src/lib/inputValidation.ts`):
 * cuerpo de 7–8 dígitos y dígito verificador módulo 11.
 */
export function cleanRut(rut: string): string {
  return rut.replace(/\./g, '').replace(/-/g, '').replace(/\s/g, '').toUpperCase();
}

export function isValidRutChileno(rut: string): boolean {
  const cleaned = cleanRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(cleaned)) return false;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return dv === expected;
}

/** RUT chileno opcional: null o vacío pasan; si hay valor, exige dígito verificador. */
export function IsRutChileno(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRutChileno',
      target: object.constructor,
      propertyName,
      options: { message: 'RUT inválido', ...validationOptions },
      validator: {
        validate(value: unknown) {
          if (value == null || (typeof value === 'string' && value.trim() === '')) return true;
          return typeof value === 'string' && isValidRutChileno(value);
        },
      },
    });
  };
}
